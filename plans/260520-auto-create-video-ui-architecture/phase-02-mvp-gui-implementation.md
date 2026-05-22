# Phase 02 — MVP GUI Implementation

**Date:** 2026-05-20 | **Priority:** HIGH | **Status:** Not Started | **Depends on:** Phase 01 approved

Context: [plan.md](./plan.md) | [phase-01](./phase-01-architecture-decision.md)

---

## Overview

Wrap the existing working CLI in a Tauri 2 + Next.js GUI. Goal: solo creator drops a URL into the app, clicks Render, watches progress, gets a 9:16 MP4. No protection yet (Phase 03 hardens). No payments yet (Phase 04 sells). Just: CLI → GUI.

Estimate: 2-3 weeks solo (assumes Tauri/Next.js familiarity from anti-detect-browser).

---

## Architecture

```
[Next.js UI]  <-- invoke/event -->  [Tauri Rust core]  <-- spawn -->  [Node sidecar (existing CLI)]
                                            |
                                            +-- secure-store (keychain)
                                            +-- sqlite (job queue)
```

- UI runs in Tauri WebView; no browser needed
- Rust core handles window, settings, queue, sidecar lifecycle
- Sidecar = current `auto-create-video` CLI repackaged as single exe (pkg or nexe)
- Communication: Tauri commands for actions; events for streaming pipeline progress

---

## Folder structure

```
e:/du_an/Auto-Create-Video/
├── (existing CLI at root — becomes sidecar source)
├── apps/
│   └── desktop/
│       ├── src/                    # Next.js UI
│       ├── src-tauri/
│       │   ├── src/                # Rust commands
│       │   ├── binaries/           # bundled Node sidecar exe
│       │   └── tauri.conf.json
│       └── package.json
└── plans/260520-auto-create-video-ui-architecture/
```

---

## Sidecar build pipeline

- Existing CLI is TypeScript + Node
- `tsc` → `dist/`
- `pkg dist/index.js -t node20-win-x64 -o auto-create-video-sidecar.exe`
- Bundle ffmpeg.exe + chrome-for-testing alongside (or download on first run)
- Place in `apps/desktop/src-tauri/binaries/auto-create-video-sidecar-x86_64-pc-windows-msvc.exe`
- Tauri picks it up via `externalBin` config

---

## UI scope (MVP only)

- [ ] Mockup-chosen layout (TBD per Phase 01 decision)
- [ ] Input panel: paste URL, pick template
- [ ] Settings page: API keys (BYOK), output dir, default template
- [ ] Job queue panel: pending / running / done with progress bar per job
- [ ] Output preview: thumbnail + open-in-folder button
- [ ] Logs view: tail of sidecar stdout for debugging

Out of scope for MVP: license gate, code obfuscation, auto-update, payments.

---

## Progress streaming

- Sidecar emits structured JSON lines on stdout: `{type:"progress", jobId, stage, pct}`
- Rust core parses each line, emits Tauri event `pipeline://progress`
- Next.js subscribes via `listen()` and updates the queue UI in real time

---

## Auto-update (deferred enable)

- Wire Tauri updater plugin now, point to placeholder endpoint
- Switch to real GitHub releases endpoint in Phase 04
- Signing key generated now, stored in 1Password / Bitwarden

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| pkg fails to bundle native deps (ffmpeg, sharp) | High | High | Ship ffmpeg.exe as separate binary; avoid sharp if possible |
| Chrome-for-Testing pushes installer past 300MB | High | Medium | Download Chrome on first run instead of bundling |
| Sidecar stdout/stderr deadlocks on large logs | Medium | Medium | Stream + rotate; cap buffer in Rust |
| Tauri v2 secure-store plugin Windows quirks | Low | Medium | Fallback to encrypted file in %APPDATA% |

---

## Security considerations

- API keys read from keychain at job-start, passed to sidecar via stdin (not env, not args)
- Sidecar runs with same user privileges as Tauri — no elevation
- Tauri CSP locked down; no remote scripts in UI
- Telemetry off by default; no phone-home in MVP

---

## Success criteria

- One video rendered end-to-end through GUI on clean Windows 10/11 VM
- Queue runs 3 jobs sequentially without crash
- Settings (API keys, output dir) persist across restart
- Installer < 250MB
- Cold launch < 1.5s

---

## Next steps

- Phase 03 (IP protection hardening)

---

## TODO

- [ ] Scaffold `apps/desktop/` with Tauri 2 init
- [ ] Copy mockup HTML into Next.js pages
- [ ] Define Tauri commands: `start_job`, `cancel_job`, `list_jobs`, `save_settings`, `load_settings`
- [ ] Define events: `pipeline://progress`, `pipeline://complete`, `pipeline://error`
- [ ] Build sidecar with pkg; verify single-exe runs standalone
- [ ] Wire sidecar spawn from Rust with stdout parsing
- [ ] Implement settings page with secure-store
- [ ] Implement queue with SQLite (rusqlite)
- [ ] Smoke test on clean Win11 VM
- [ ] Document install steps in README for internal testers
