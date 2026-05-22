# Auto-Create-Video UI Architecture Plan

**Date:** 2026-05-20 | **Owner:** solo dev | **Status:** Ready for review

---

## TL;DR

Build GUI as **Tauri 2 desktop app** wrapping existing Node CLI as sidecar. Use **BYOK** (customer brings own LucyLab/Claude/Gemini keys) to eliminate server cost + key-leak risk. Layer **bytenode + javascript-obfuscator + Keygen.sh license** for code protection. Reuse Tauri toolchain already proven in `anti-detect-browser`. Total dev time: 4-6 weeks solo. Ongoing infra cost: $0.

This wins both axes the user asked about: better UX than web (no browser tab, native install, offline-capable shell), and dramatically better code protection than web (Rust shell + V8 bytecode + license gate vs trivially-inspectable JS in a browser).

---

## Why NOT pure web

- Web shifts rendering to a server you must pay for ($0.50-2/video). Solo dev cannot subsidize 100-1000 VN customers.
- Source maps, dev tools, network tab make JS pipeline trivially extractable.
- VN creator market expects installable tools; browser-only feels unprofessional for paid product.

## Why NOT server-side SaaS

- $100-500/month infra burn before first dollar of revenue.
- Puppeteer + FFmpeg per-job is heavy; cold starts hurt UX on Vercel/CF.
- User's own pipeline already runs locally — moving to cloud is a backward step.

---

## Top 3 architectures compared

| Axis | Tauri 2 + BYOK (pick) | SaaS (cloud) | Electron desktop |
|---|---|---|---|
| UX | Native, ~20MB, 0.4s start | Browser, 0-2s, needs internet | Native, ~200MB, 1.5-2.5s start |
| Infra cost | $0/mo | $100-500/mo | $0/mo |
| Code protection | Rust shell + bytecode + license | Server-only (best) but UI still JS | ASAR trivially unpacks |
| Dev time (solo) | 4-6 weeks (familiar stack) | 6-10 weeks (new infra) | 5-7 weeks |
| Distribution | .msi installer + auto-update | URL | .exe installer + manual update |
| Key leak risk | None (BYOK) | Server keys safe | High if embedded |

---

## Phases

| # | File | Priority | Status | Summary |
|---|---|---|---|---|
| 01 | [phase-01-architecture-decision.md](./phase-01-architecture-decision.md) | CRITICAL | Not Started | Lock Tauri 2 + Node sidecar + BYOK stack |
| 02 | [phase-02-mvp-gui-implementation.md](./phase-02-mvp-gui-implementation.md) | HIGH | Not Started | Wrap CLI with Tauri 2 + Next.js GUI |
| 03 | [phase-03-ip-protection-hardening.md](./phase-03-ip-protection-hardening.md) | HIGH | Not Started | bytenode + obfuscator + Keygen license |
| 04 | [phase-04-distribution.md](./phase-04-distribution.md) | MEDIUM | Not Started | Code-sign, installer, sales channel |

---

## Open questions

1. Which of 5 mockups (`design/mockup-XX.html`) to implement?
2. Pricing model: one-time license vs monthly?
3. Bundle Chrome-for-Testing (~280MB total installer) vs require user-install?
4. Sales channel: Gumroad / Polar / direct bank transfer?
