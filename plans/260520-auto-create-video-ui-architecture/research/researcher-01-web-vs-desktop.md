# Auto-Create-Video UI Architecture Research
**Date:** 2026-05-20 | **Researcher:** Claude Code (Haiku 4.5)

---

## Decision Matrix

| Axis | Pure Web SaaS | Web Self-Hosted (localhost) | **Tauri 2 Desktop** | Electron Desktop | Hybrid (Desktop UI + Cloud) |
|------|---|---|---|---|---|
| **Installer Size** | N/A | N/A | ~15–30MB | 150–250MB | ~20–40MB |
| **Memory (idle)** | N/A | 80–120MB | 50–80MB | 250–350MB | 60–100MB |
| **Startup Latency** | 0–2s (browser) | 2–4s (Node boot) | 0.4–0.8s (native WebView) | 1.5–2.5s | 0.5–1.5s |
| **User Hardware** | Minimal (browser) | Requires Node + 16GB (heavy) | Requires Node + 16GB (heavy) | Requires Node + 16GB (heavy) | Minimal (thick client) |
| **Distribution Friction** | None (link) | High (installer) | Low (exe + auto-update) | Medium (exe, larger) | Low (exe + auto-update) |
| **Windows SmartScreen** | N/A | High risk | Medium risk (signed) | High risk | Medium risk (signed) |
| **Rendering Cost/Video** | $0.50–2.00 | $0 (local) | $0 (local) | $0 (local) | $0.50–1.50 (cloud) |
| **Offline Capability** | ✗ (needs API calls) | ✗ (needs API calls) | ✗ (needs API calls) | ✗ (needs API calls) | ✗ (needs API calls) |
| **Update Friction** | Single deploy | Manual downloads | Auto-update built-in | Manual or complex | Auto-update built-in |
| **Dev Complexity (solo)** | Moderate (Next.js + backend) | High (Node setup + distribution) | **Low** (familiar: Tauri + Next.js) | High (Electron ecosystem) | High (client-server sync) |

---

## Top 2 Recommendations

### 🥇 **Tauri 2 Desktop** (Primary Recommendation)
**Rationale:**
- **Fit:** You've already shipped `anti-detect-browser` with Tauri 2 + Next.js. Leverage existing expertise.
- **User expectation:** VN solo creators expect installable tools (not browser-only workflows). Desktop = professionalism.
- **Cost:** Zero rendering cost vs $0.50–2/video on SaaS.
- **Distribution:** ~20MB installer, auto-update, native Windows integration. SmartScreen pain is one-time (code sign + reputation).
- **Performance:** 0.4s startup, 50–80MB idle. Comfortable for laptop workflow (5–30 videos/week = low sustained load).
- **Monetization:** Single binary = easy shrinkwrap or paid download model. No monthly server bill.

**Action:** Start with Tauri 2. Embed Node.js sidecar (as you're already doing), Puppeteer-core + FFmpeg. Next.js webview for UI.

---

### 🥈 **Hybrid: Desktop UI + Cloud Rendering** (If local hardware fails)
**Rationale:**
- Fallback if user's 16GB laptop can't sustain 5–30 videos/week.
- Tauri desktop UI (0–30MB) + cloud job queue (AWS Lambda + ECS for render).
- Cost: $0.50–1.50/video (cheaper than pure SaaS ~$2/video because rendering is marginal cost).
- User gets offline-capable job management UI but offloads heavy lifting.

**Action:** Don't build this first. Try Tauri local render. If bottleneck emerges (>3 concurrent videos, >80% CPU), revisit.

---

## Critical Tradeoffs

### Local Rendering (Tauri) Tradeoff
**Pro:** Free, fast, private data (no cloud).  
**Con:** Laptop must stay powered. User bears CPU heat/battery drain. 16GB RAM minimum. Scaling to 30 videos/week = ~10hrs CPU/week on their machine.

**Reality check:** VN solo creators on budget laptops (8–12GB) may struggle. Consider hybrid tier-2.

---

### SmartScreen & Windows Defender False Positives
**Tauri + auto-update:** Medium risk once signed + reputation builds.  
**Electron:** Higher risk due to ~200MB bundle triggering heuristic scanners.  
**Mitigation:** Code-sign immediately ($100/yr). Build reputation (Tauri repos grow 55% YoY; fewer false flags emerging).

---

### Cold-Start Chrome Download
**Puppeteer-core:** Does NOT auto-download Chrome when npm-installed.  
**Action:** Bundle Chrome into installer OR use `chrome-for-testing` (~280MB). Increases installer size but guarantees compatibility. Evaluate trade-off.

---

### Monetization Model Lock-In
- **Tauri desktop:** Shrinkwrap, one-time buy, or subscription (local license check).
- **SaaS:** Recurring subscription only.
- **Hybrid:** Tier-1 (desktop, local render, free or one-time) + Tier-2 (cloud render, $9–15/mo).

Decision now shapes your product line. Tauri gives optionality.

---

## Unresolved Questions

1. **User's typical laptop specs?** (RAM, CPU cores, storage). If <12GB RAM, local rendering may bottleneck.
2. **Internet connectivity:** Do VN solo creators work offline? If yes, SaaS + hybrid lose appeal.
3. **Chrome-for-Testing bundle size:** Will users tolerate 280MB total installer (20MB Tauri + 280MB Chrome + 50MB FFmpeg)?
4. **Payment preference:** One-time buy vs monthly subscription? Guides architecture.
5. **Concurrent job handling:** Can user queue 5 videos and let them render overnight? Or expect single-job workflow?

---

## Sources
- [Tauri vs Electron 2026: 96% Smaller Apps](https://tech-insider.org/tauri-vs-electron-2026/)
- [Tauri vs Electron: Building Desktop Apps in 2025](https://bnowdev.com/blog/tauri-vs-electron--building-desktop-apps-in-2025/)
- [Comparing Electron and Tauri](https://blog.openreplay.com/comparing-electron-tauri-desktop-applications/)
- [Vietnam Digital Content Creation Market](https://www.imarcgroup.com/vietnam-digital-content-creation-market)
- [Video Rendering with Node.js and FFmpeg](https://creatomate.com/blog/video-rendering-with-nodejs-and-ffmpeg)
- [FFmpeg API Services 2026](https://renderio.dev/blogs/best-ffmpeg-api-2026)
- [GitHub: Puppeteer](https://github.com/puppeteer/puppeteer)
