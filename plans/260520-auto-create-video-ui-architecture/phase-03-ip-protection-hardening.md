# Phase 03 — IP Protection Hardening

**Date:** 2026-05-20 | **Priority:** HIGH | **Status:** Not Started | **Depends on:** Phase 02 working

Context: [plan.md](./plan.md) | [research/researcher-02-ip-protection.md](./research/researcher-02-ip-protection.md)

---

## Overview

Make code extraction expensive enough that hobbyists give up and serious clones take 2-4 weeks (long enough to ship next iteration). Layer defense in depth — no single layer is uncrackable, but all together raise the cost above the prize.

Honest framing: protection buys a 6-12 month head start. It does NOT prevent eventual cloning. Ship features faster than competitors copy.

Estimate: 1-2 weeks solo.

---

## Protection layers (defense in depth)

### Layer 1 — bytenode (the bytecode wall)
- Compile all pipeline TS → .jsc (V8 bytecode) before packaging
- `npx bytenode --compile dist/**/*.js`
- Sidecar entry stub loads .jsc files
- Breaks: copy-paste clones, hobbyist source dumps
- Doesn't break: skilled RE with Ghidra (2-4 weeks effort)

### Layer 2 — javascript-obfuscator (the entry-point lock)
- Run on entry stub + glue code that bytenode can't cover
- Use VM mode + string array + control-flow flattening
- Tradeoff: ~5% startup penalty, acceptable for batch tool

### Layer 3 — Tauri Rust shell (the gate)
- License check happens in Rust BEFORE sidecar spawns
- Failed license = sidecar never starts, .jsc never loads
- HyperFrames template decryption key lives in Rust binary
- Rust binary harder to reverse than JS (no off-shelf decompiler)

### Layer 4 — Keygen.sh license validation
- Free tier: 1000 monthly active licenses
- Online activation on first launch; cache JWT 7 days
- Force re-validate when JWT expires
- Revoke on refund / chargeback

### Layer 5 — BYOK (no keys to steal)
- Customer's own API keys in OS keychain
- Dev never embeds keys → competitors get nothing from binary inspection
- Bonus: shields dev from key abuse / billing fraud

### Layer 6 — Watermark + kill-switch (last resort)
- Every output MP4 carries invisible watermark = license ID
- If license revoked, sidecar refuses to start next launch
- 7-day offline grace, then hard stop

---

## What we deliberately do NOT do

- **No anti-debug** — wastes time, breaks user debugging, easily bypassed
- **No DRM (Denuvo-like)** — overkill, alienates VN customers, expensive
- **No server-side rendering** — burns $100-500/mo before first sale
- **No code-virtualization (VMProtect)** — Rust binary already raises bar enough

---

## Library + tooling stack

| Concern | Tool | Cost |
|---|---|---|
| Bytecode compile | bytenode v11.x | Free |
| JS obfuscation | javascript-obfuscator v4.x | Free |
| License | Keygen.sh free tier | $0/mo (≤1000 users) |
| Keychain | tauri-plugin-stronghold or OS-native | Free |
| Template encryption | age or libsodium via Rust | Free |

---

## Threat model recap

| Attacker | Effort without us | Effort with us | Worth it? |
|---|---|---|---|
| Script kiddie | 5 min | Can't get past license | YES |
| Hobbyist | 1 day | 2-4 weeks | YES |
| Pro RE hired by competitor | 1 week | 4-8 weeks | MARGINAL |
| Output reverse-engineer | 1-2 weeks | 1-2 weeks (untouched) | NO — can't defend |

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| bytenode breaks on Node minor-version mismatch | High | High | Pin sidecar Node version exactly; rebuild on each Node bump |
| Keygen.sh outage = customers can't launch | Low | High | 7-day offline grace; fallback static check |
| Obfuscation triggers AV false positives | Medium | High | Code-sign + submit binary to Microsoft for whitelist |
| Template encryption key extracted from Rust binary | Medium | Medium | Rotate keys quarterly + ship new templates monthly |
| License-check UX frustrates legit users | Medium | High | Clear error messages + offline grace + manual unlock fallback |

---

## Security considerations

- License JWT signed with Keygen public key; verify in Rust, not JS
- Keychain reads only inside Rust; never expose decrypted key to UI process
- HTTPS pinning for Keygen + AI provider hosts
- No telemetry beyond license heartbeat (privacy-respecting build trust)
- Open-source the Tauri shell (UI scaffold) if asked, keep sidecar closed — bytenode hides the secret sauce

---

## Success criteria

- Extracting binary with asar/unzip yields obfuscated stubs + .jsc files (no readable TS)
- Running on unlicensed machine fails at Rust gate before sidecar spawns
- Revoking license in Keygen dashboard kills user's app within 7 days
- No false-positive Defender quarantine after code-signing
- Startup overhead from protection < 200ms

---

## Next steps

- Phase 04 (distribution + sales)

---

## TODO

- [ ] Install bytenode + wire into sidecar build
- [ ] Add javascript-obfuscator step to build pipeline
- [ ] Integrate Keygen.sh — register product, generate API token
- [ ] Implement Rust license-check command (online + cached JWT)
- [ ] Encrypt HyperFrames templates with age; decrypt in Rust
- [ ] Add watermark embedding to FFmpeg step in sidecar
- [ ] Test extraction: unzip the .msi, confirm no readable source
- [ ] Test revocation: revoke license, confirm app stops within 7 days
- [ ] Document license activation UX for VN customers (Vietnamese tutorial)
