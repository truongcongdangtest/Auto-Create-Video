# Phase 04 — Distribution

**Date:** 2026-05-20 | **Priority:** MEDIUM | **Status:** Not Started | **Depends on:** Phase 03 done

Context: [plan.md](./plan.md) | [phase-03](./phase-03-ip-protection-hardening.md)

---

## Overview

Ship to first paying VN customer. Bundle, sign, distribute, collect money. Don't over-engineer — first sale matters more than fancy infra.

Estimate: 1 week solo.

---

## Build artifact

- Format: `.msi` installer (Windows-first per [[project-anti-detect-browser-tech]])
- Target: ~80MB without Chrome, ~350MB with bundled chrome-for-testing
- Tauri bundler config: `wix` for .msi, embed icons + EULA
- Versioning: semver, auto-bump from git tag

---

## Code signing (mandatory)

- Without signing → SmartScreen blocks → VN customers panic → refunds
- Options:
  - **DigiCert OV cert**: ~$200/yr, instant trust after a few hundred installs
  - **DigiCert EV cert**: ~$400-500/yr, instant SmartScreen trust day-one
  - **SignPath free tier**: free for open-source, NOT applicable here (closed sidecar)
- Recommend: start with OV ($200), upgrade to EV if SmartScreen still warns after 100 installs

---

## Update channel

- Tauri updater plugin
- Endpoint: GitHub Releases (free) OR Cloudflare R2 bucket (cheap, fast in VN)
- Signed update manifests using key generated in Phase 02
- Recommend R2 — better VN latency than GitHub
- Mandatory updates for security; opt-in for features

---

## Sales channel options

| Channel | Pros | Cons | VN fit |
|---|---|---|---|
| **Gumroad** | MoR (handles tax), simple, instant | 10% + $0.30/sale; no VN bank | Decent |
| **Polar** | MoR, modern API, low fee, dev-friendly | Newer, less VN-tested | Good |
| **Direct bank transfer + manual license** | Zero fees, VN-native | Manual reconciliation, no MoR | Best for VN locals |
| **SePay** | VN bank QR, automated webhooks | VN-only, no global | Best for VN-only launch |

Recommend: **SePay for VN customers + Polar as global fallback**. Both integrate with Keygen via webhook → auto-issue license on payment.

References available in repo: [[skill-payment-integration]], `integrate:sepay`, `integrate:polar` skills.

---

## Pricing model

| Model | Pros | Cons |
|---|---|---|
| **One-time license** ($49-99) | Simple, low churn, "tool" feel | No recurring revenue |
| **Monthly subscription** ($9-15/mo) | Recurring revenue, force updates | Higher churn, license-check anxiety |
| **Hybrid** (one-time + optional yearly updates) | Best of both | More complex to communicate |

Recommend: **one-time $79 license with 1 year of updates included; $29/yr for updates after**. Matches VN preference for one-time spend on tools.

---

## Refund + piracy expectations

- VN market: assume 20-40% piracy rate baseline
- Mitigation: Keygen revocation + 7-day grace + watermarked outputs
- Refund policy: 7 days, no questions, revoke license on refund
- Don't fight piracy aggressively — focus on shipping new features for paying users

---

## Marketing surface (lightweight)

- Landing page: 1 static page, screenshots from mockups, demo video
- Hosted on Vercel free tier or Cloudflare Pages
- VN-language copy primary, English secondary
- Demo video: render one viral TikTok-shop affiliate script end-to-end, post on TikTok itself

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SmartScreen blocks all downloads month 1 | High | High | EV cert OR pre-warm with friendly installs |
| Defender quarantines obfuscated binary | Medium | High | Submit hash to Microsoft Defender exclusion |
| SePay integration breaks during VN holiday | Medium | Medium | Manual license issuance fallback |
| Refund fraud (use + refund) | Medium | Medium | License revoke + watermark trace |
| Update server (R2) outage | Low | Low | Updates non-critical; degrade gracefully |

---

## Security considerations

- Code-signing key in cloud HSM (DigiCert KeyLocker) — never on dev laptop
- Updater requires signed manifest; reject unsigned
- Payment webhooks verified by signature (SePay HMAC, Polar JWT)
- Customer email + license ID stored in Keygen — no other PII collected

---

## Success criteria

- First paying customer completes: pay → receive license → install → render → output
- Install→first-render works on clean Windows 10/11 (no dev tools, no Node, no Python)
- SmartScreen "Run anyway" or no warning at all after signing
- Auto-update successfully delivers v1.0.1 to v1.0.0 users
- Refund flow: revoke license → user's app stops working within 7 days

---

## Next steps

- (Post-launch) Phase 05 — telemetry + feedback loop (out of scope this plan)

---

## TODO

- [ ] Purchase DigiCert OV cert + integrate into Tauri build
- [ ] Set up Cloudflare R2 bucket for updates
- [ ] Configure Tauri updater endpoint + sign first release
- [ ] Integrate SePay webhook → Keygen license issuance
- [ ] Integrate Polar (fallback global channel)
- [ ] Build landing page + 60s demo video
- [ ] Submit signed binary to Microsoft Defender for whitelist
- [ ] Write refund policy + EULA (VN + EN)
- [ ] Soft launch to 5 friendly testers; collect feedback
- [ ] Public launch on TikTok + VN creator FB groups
