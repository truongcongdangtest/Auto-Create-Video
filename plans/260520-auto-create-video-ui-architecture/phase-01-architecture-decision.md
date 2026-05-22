# Phase 01 — Architecture Decision

**Date:** 2026-05-20 | **Priority:** CRITICAL | **Status:** Ready for review

Context: [plan.md](./plan.md) | [research/researcher-01-web-vs-desktop.md](./research/researcher-01-web-vs-desktop.md) | [research/researcher-02-ip-protection.md](./research/researcher-02-ip-protection.md)

---

## Overview

Lock the stack before writing a line of GUI code. Solo dev cannot afford a mid-build pivot. Two researchers converge on Tauri 2 + BYOK + light obfuscation. This phase documents the decision and kills further debate.

---

## Key insights from research

- Tauri 2 ships ~20MB installer, 50-80MB idle RAM, 0.4s cold start. Electron ships 150-250MB, 250-350MB idle. No contest for VN laptop users.
- Bytenode is NOT impenetrable (PT Security cracked it in Ghidra) but slows hobbyist clones from 1 day to 2-4 weeks. Buys 6-12 month head start.
- API key leakage is the single biggest risk. BYOK eliminates it entirely — keys never touch dev's binary.
- Real IP is templates + HyperFrames designs, NOT prompts (prompts decay in 3-6mo anyway). Protect what matters.
- Server-side rendering = $100-500/mo before first sale. Killer for solo monetization.

---

## Decision matrix (final)

| Criterion | Weight | Tauri+BYOK | SaaS | Electron |
|---|---|---|---|---|
| Infra cost | HIGH | 10 | 2 | 10 |
| Code protection | HIGH | 7 | 9 | 4 |
| Dev velocity (familiar) | HIGH | 10 | 4 | 5 |
| User UX | MEDIUM | 9 | 6 | 6 |
| Distribution | MEDIUM | 8 | 10 | 6 |
| **Total** | | **44** | 31 | 31 |

---

## Selected stack

- **Shell:** Tauri 2 (Rust) — handles window, updater, license check, OS keychain
- **UI:** Next.js 15 (static export) — reuse anti-detect-browser patterns
- **Pipeline:** existing Node CLI as Tauri sidecar binary
- **State:** Tauri secure-store (OS keychain) for API keys; SQLite for job queue
- **License:** Keygen.sh free tier (1000 users free)
- **AI keys:** BYOK — customer pastes own LucyLab/Claude/Gemini key into Settings

---

## BYOK strategy

- Settings UI accepts user's API keys for each provider used
- Keys persisted in OS keychain (Windows Credential Manager) via Tauri secure-store plugin
- Sidecar reads keys at job-start via IPC, never logs them
- Zero proxy server → zero monthly cost → zero key-leak liability
- Friction: customer must obtain own API keys (mitigate with in-app links + Vietnamese docs)

---

## IP protection layers

1. Tauri Rust shell — harder to reverse than pure JS
2. bytenode compile all pipeline TS → .jsc (V8 bytecode)
3. javascript-obfuscator (VM mode) on entry points + glue code
4. Keygen.sh online license validation on launch + every 7 days
5. HyperFrames templates encrypted, decrypted in-memory by Rust shell

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Laptop CPU bottleneck (8-12GB users) | Medium | High | Document min specs; queue with concurrency=1 default |
| BYOK onboarding friction lowers conversion | High | Medium | In-app provider signup links + VN-language tutorials |
| Keygen.sh free tier outgrown | Low | Low | $50/mo pro tier kicks in past 1000 users |
| Tauri sidecar can't bundle Chrome cleanly | Medium | Medium | Test chrome-for-testing bundling in Phase 02 spike |

---

## Security considerations

- Tauri allowlist: only enable filesystem (project dirs), shell (sidecar spawn), http (Keygen + AI APIs)
- API keys NEVER written to disk in plaintext — keychain only
- License JWT cached locally with 7-day TTL; force re-check on TTL expiry
- Code-sign the .msi to bypass SmartScreen warnings

---

## Next steps

- [ ] User approves stack (Tauri + BYOK + Keygen)
- [ ] User picks one of 5 mockups in `design/mockup-XX.html`
- [ ] User picks pricing model (one-time vs monthly)
- [ ] User confirms BYOK acceptable (vs server-proxy)
- [ ] Move to Phase 02

## Success criteria

- Decision document signed off
- No architecture pivots requested in next 4 weeks
- Stack matches anti-detect-browser toolchain for skill reuse

---

## TODO

- [ ] Review research files with user
- [ ] Walk user through decision matrix
- [ ] Collect answers to 4 open questions in plan.md
- [ ] Update this file with chosen mockup + pricing model
- [ ] Mark status = APPROVED before starting Phase 02
