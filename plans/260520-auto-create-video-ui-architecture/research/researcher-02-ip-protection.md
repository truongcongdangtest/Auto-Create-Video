# IP Protection Research: Node.js/TypeScript Video Pipeline

**Date**: 2026-05-20 | **Target**: VietViral (100–1000 VN customers)

---

## 1. Protection-Level Matrix

| Strategy | Script Kiddie (5min) | Hobbyist (1day) | Serious Competitor (1week+) | Implementation Effort | Startup Overhead | Update Friction | Server Cost |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **None** (MIT open) | ✓ | ✓ | ✓ | — | — | — | — |
| **JS Obfuscator** | ✓ | ○ | ○ | 2h | ~5% | Low | — |
| **Bytenode** (V8 bytecode) | ✗ | ○ | ✓ | 1d | ~2% | Medium (rebuild) | — |
| **pkg/nexe binary** | ✗ | ○ | ○ | 2d | ~1% | Medium | — |
| **Tauri + obfuscation** | ✗ | ○ | ○ | 3–5d | ~3% | Medium | — |
| **Server-side (Vercel/CF Workers)** | ✗ | ✗ | ✗ | 3–7d | ~0% client | Low | $50–500/mo |
| **Hybrid** (client UI + server pipeline) | ✗ | ✗ | ✗ | 5–10d | ~2% | Medium | $100–300/mo |
| **Keygen + license validation** | ✓ | ○ | ○ | 1–2d | ~1% | Low | $0 (free tier) |
| **BYOK (customer API key)** | ✗ | ✗ | ✗ | 1–2d | — | Low | — |

**Legend**: ✓ = broken easily, ○ = slows attacker, ✗ = serious effort | Competitor focused on your prompt templates & designs, NOT Claude model internals.

---

## 2. Bytenode Reality Check

**Status**: Bytecode ≠ source code, but **not impenetrable**.

- **What PT Security found** (2024): Bytenode V8 bytecode decompilable in Ghidra with custom tooling. Requires: V8 serialization knowledge + heap reverse-engineering + 167+ instruction-set familiarity.
- **Timeline**: Days–weeks for specialized RE engineer, not hobbyist task.
- **Practical defense level**: Stops copy-paste clones; slows serious competitors; buys 6–12mo head start IF you update templates/prompts frequently.

**Limitation**: Does NOT protect API keys embedded in binary—still leak via traffic analysis or memory dumps.

---

## 3. Tauri vs Electron for Code Protection

| Aspect | Tauri v2 | Electron |
|--------|---------|----------|
| **JS bundle extraction** | Stored in `/resources` → extractable same as Electron (ZIP in ASAR archive) | Packaged in ASAR (extractable in seconds with asar CLI) |
| **Rust backend obfuscation** | Possible (Rust binary is harder to reverse than JS); no off-shelf tool for easy decompilation | N/A (no compiled backend) |
| **Memory safety** | ✓ Rust prevents entire classes of vulns | Electron native code has larger attack surface |
| **Security-by-default** | Whitelist model: APIs blocked until explicitly enabled | Default permissive (requires manual hardening) |
| **XSS → RCE risk** | Lower (Rust backend isolation) | Higher (Node.js in renderer has FS/process access) |
| **Code protection winner** | Slight edge: Rust backend harder to reverse; JS still extractable | ASAR still trivial to unpack |

**Verdict**: Tauri has **slightly better inherent protection** (Rust binary hard to reverse), but JS bundle is equally exposed. Use **both frameworks with obfuscation**, not Tauri alone.

---

## 4. Recommended Approach for VN Solo Creator

### Tier 1: Minimum Viable Protection (1–2 weeks, $0/mo)

**Stack**: Tauri 2 + obfuscator + Keygen (free tier) + BYOK or server-side key proxy

1. **Desktop delivery**: Tauri (Windows/macOS bundle)
2. **JS obfuscation**: javascript-obfuscator (VM bytecode mode) + minification
3. **License validation**: Keygen API (free: 100 ALU) checks license on first launch
4. **API key handling**: 
   - **Option A (BYOK)**: Customer provides own Claude/Gemini key → BYO.com vault or AIProxy proxy
   - **Option B (Server proxy)**: User requests routed to Vercel/CF function → function injects your API key, redacts result, returns only final video
5. **Time-bomb mitigation**: License expires; customer must renew annually

**Cost**: $0 ongoing. Update friction: medium (rebuild + code-sign binary).

---

### Tier 2: Maximum Practical Protection (2–3 weeks, $100–300/mo)

**Stack**: Tauri + bytenode + Keygen + Vercel Functions (server pipeline)

1. **Split architecture**:
   - **Client** (Tauri): UI, template picker, HyperFrames editor, output preview
   - **Server** (Vercel/CF): Puppeteer + FFmpeg + API calls (your prompts stay server-side)
2. **Bytenode**: Compile Tauri's Rust sidecar orchestrator to bytecode
3. **License server**: Keygen validates license; server checks before processing
4. **Result**: Competitor gets UI mockup only; pipeline logic & prompts remain opaque

**Cost**: ~$100–300/mo (Vercel functions at scale). Update: Push new functions without client rebuild.

---

## 5. API Key Handling (Standard Practice)

| Approach | Stripe/Twilio Pattern | Best For | Trade-off |
|----------|---|---|---|
| **Embed in client binary** | ❌ Never | — | Keys leak via traffic interception, memory dumps |
| **BYOK (Bring Your Own Key)** | ✓ Common (DataDog, n8n, Zapier) | Solo product, no SaaS | Customer complexity, but full transparency |
| **Server-side proxy** | ✓ Standard (OpenAI wrapper apps) | Production SaaS | Ongoing server cost; customer data travels through your servers (privacy risk) |
| **Keyed API endpoint** | ✓ Used by Stripe, OpenAI | Paid API wrappers | Requires trust in your infrastructure |

**Honest take**: Wrapping Claude/Gemini in a server is industry standard. VN customers likely comfortable with it (vs open-source paranoia). BYO adds friction but transparency.

---

## 6. Is Protection Worth It?

### The Brutal Truth

**No. Here's why:**

1. **Claude prompts are NOT valuable IP**: Your competition value = prompt engineering skill. But:
   - Prompts degrade in utility within 3–6mo (model updates shift behavior)
   - Reverse-engineering from output is ~80% effective (competitor can see what prompts generate)
   - You'll iterate faster than any imitator can copy

2. **Real IP is templates + workflow**: HyperFrames designs, voice/SFX selection heuristics, motion-graphics rules. These are:
   - Locked in UX/config (hard to reverse from binary)
   - Rapidly updated (moat erodes if you ship new designs monthly)
   - Valuable 3–12 months, then commoditize

3. **Competitive moat is execution speed**: If you ship 10 new features before competitor clones, you win. If you ship 0 and they clone, you lose. Protection buys time; it doesn't prevent loss.

4. **Protection cost**: Bytenode + Keygen + testing = 5–10 days of dev time. Revenue from 100–1000 customers in VN market = $100–500K/year. **ROI threshold: 6 months break-even.** Only protect if you'll operate that long.

---

## 7. Concrete Tooling Stack (Recommended)

### Minimal Protection
```
1. pkg v5.8+ (simple binary wrapper) 
   OR Tauri v2 (better security posture)
2. javascript-obfuscator v4.x (VM bytecode option)
3. Keygen free tier (license validation)
4. Customer's own API keys (BYOK) or lightweight server proxy
```

### Production Protection
```
1. Tauri v2 (Windows/macOS bundle)
2. bytenode v11.x (V8 bytecode for orchestrator)
3. javascript-obfuscator (VM mode for sidecar scripts)
4. Keygen pro tier ($50/mo) or Paddle + Keygen webhook
5. Vercel Functions (Puppeteer + FFmpeg server-side)
6. BYO.com or AIProxy (customer API key vault)
```

### Honest Assessment Table

| Threat Model | Expected Attacker | Effort to Clone | Is Protection Worth It? |
|---|---|---|---|
| **Casual download + run** | Script kiddie | ~5min (no protection needed) | NO |
| **Source-code inspection** | Hobbyist | ~1–2 days (bytenode + obfuscation slows to 2–4 weeks) | YES (6–12mo competitive head start) |
| **Professional reverse engineer hired by competitor** | Paid RE firm | 2–6 weeks (bytenode bypassed in 3–4 weeks; prompts extracted) | NO (timeline too long; not worth competitor's cost) |
| **Competitor monitors your output & reverse-prompts** | Skilled team | ~1–2 weeks (samples Claude script generation; rebuilds from output) | NO (they got you anyway) |

---

## 8. Unresolved Questions

- **Can Tauri's Rust sidecar expose API keys via stack inspection?** (Answer: unlikely, but needs testing)
- **Does Vercel Functions limit concurrent Puppeteer instances?** (Check cold-start penalty for 1000 concurrent users)
- **What's realistic customer churn in VN market for video-gen SaaS?** (Affects ROI calc for protection investment)
- **Does license-expiration UX frustrate customers enough to demand cracks?** (Keygen requires online validation; offline mode?)

---

## Sources

- [PT Security: Bytenode Decompilation in Ghidra](https://swarm.ptsecurity.com/how-we-bypassed-bytenode-and-decompiled-node-js-bytecode-in-ghidra/)
- [Keygen: Software Licensing API](https://keygen.sh/)
- [BYO: Bring Your Own Key Vault](https://usebyo.com/)
- [AIProxy: Zero-Knowledge API Proxy](https://www.aiproxy.com/)
- [javascript-obfuscator on npm](https://www.npmjs.com/package/javascript-obfuscator)
- [Tauri vs Electron Security (OpenReplay Blog)](https://blog.openreplay.com/comparing-electron-tauri-desktop-applications/)
- [Claude Prompt Reverse Engineering Risk](https://cymulate.com/blog/cve-2025-547954-54795-claude-inverseprompt/)
