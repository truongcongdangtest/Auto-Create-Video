import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Script, TemplateDataType } from "./script-schema.js";
import type { TiktokConfig } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "templates");
const BLOCKS_DIR = join(__dirname, "blocks");

// Grain overlay HTML inline (from installed component)
const GRAIN_OVERLAY_HTML = `<div id="grain-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;"><div class="grain-texture"></div></div>`;

// Brand logo (Cloak Login spy mark) inlined as a base64 data URI so the
// persistent shell renders without any pipeline asset-copy step. Read once,
// lazily, and cached for the process lifetime.
let _brandLogoDataUri: string | null = null;
function brandLogoDataUri(): string {
  if (_brandLogoDataUri === null) {
    const buf = readFileSync(join(TPL_DIR, "brand-logo.png"));
    _brandLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return _brandLogoDataUri;
}

// Default brand tagline under the channel name (overridable via metadata.tagline).
const DEFAULT_TAGLINE = "TRÌNH DUYỆT ANTIDETECT";

// Ambient floating background icons (antidetect-themed, faint, slow drift).
// Rendered inside .shell-bg so they sit behind every scene. Motion is pure
// CSS (linear/ease loops) — see styles.css .fic-* — so it samples smoothly
// frame-by-frame instead of flickering like the old steps() grain.
const FLOAT_ICON_SVGS = [
  // fingerprint
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 11a2 2 0 0 0-2 2c0 1 .1 2 .4 3"/><path d="M12 7a6 6 0 0 0-6 6c0 1.2.2 2.4.5 3.5"/><path d="M2 13A10 10 0 0 1 18.5 5.3"/><path d="M22 13c0 1.5-.2 3-.6 4.4"/><path d="M16 13a4 4 0 0 0-7-2.6"/></svg>`,
  // shield-check
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  // globe (proxy)
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>`,
  // lock
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  // browser window
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r=".6" fill="currentColor"/><circle cx="9" cy="6.5" r=".6" fill="currentColor"/></svg>`,
  // user profile
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>`,
  // layers (profiles)
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>`,
];

const FLOAT_ICONS_HTML =
  `<div class="float-icons" aria-hidden="true">` +
  FLOAT_ICON_SVGS.map((svg, i) => `<span class="fic fic-${i}">${svg}</span>`).join("") +
  `</div>`;

// ── Large per-scene SVG illustrations ───────────────────────────────────────
// Line-art (stroke=currentColor → tints to theme accent). Picked per scene via
// the optional `illustration` field; rendered prominently in the scene's upper
// zone. Unknown/missing keys render nothing. 200×200 viewBox.
// Detailed 2-tone illustrations. Primary line/fill = currentColor (the scene
// accent, orange); secondary highlights = white (#fff). Each combines: a soft
// filled body shape (fill-opacity, for "mass"), crisp orange outlines, white
// accent details (data points, ticks, scan lines, $), and small 4-point
// sparkles — so the graphic reads rich and full, not a thin wireframe.
export const ILLUSTRATIONS: Record<string, string> = {
  // Rising bar chart + white trend line, data dots, up-arrow, sparkle — growth / revenue / "more".
  "growth-chart": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><g stroke-width="2" stroke-opacity="0.16"><path d="M44 66h134M44 104h134M44 142h134"/></g><path d="M44 24v156h150" stroke-opacity="0.9"/><rect x="60" y="128" width="22" height="50" rx="3" fill="currentColor" fill-opacity="0.16"/><rect x="98" y="94" width="22" height="84" rx="3" fill="currentColor" fill-opacity="0.27"/><rect x="136" y="56" width="22" height="122" rx="3" fill="currentColor" fill-opacity="0.42"/><path d="M54 122l38-28 30 16 46-52" stroke="#fff" stroke-opacity="0.92" stroke-width="3.5"/><g fill="#fff" stroke="none"><circle cx="54" cy="122" r="4.5"/><circle cx="92" cy="94" r="4.5"/><circle cx="122" cy="110" r="4.5"/><circle cx="168" cy="58" r="4.5"/></g><path d="M152 56l16-2-2 16" stroke="#fff" stroke-width="3.5"/><path d="M176 24l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" fill="#fff" fill-opacity="0.85" stroke="none"/></svg>`,
  // Two devices linked to ONE shared hub w/ pulse ring — "same IP / linked accounts" (risk).
  "network-link": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M48 64L100 130M152 64L100 130" stroke-width="3.5" stroke-opacity="0.55"/><g fill="#fff" stroke="none"><circle cx="71" cy="94" r="4"/><circle cx="129" cy="94" r="4"/></g><rect x="22" y="30" width="52" height="38" rx="7" fill="currentColor" fill-opacity="0.16"/><path d="M22 60h52" stroke-opacity="0.6"/><circle cx="48" cy="44" r="3" fill="#fff" stroke="none"/><rect x="126" y="30" width="52" height="38" rx="7" fill="currentColor" fill-opacity="0.16"/><path d="M126 60h52" stroke-opacity="0.6"/><circle cx="152" cy="44" r="3" fill="#fff" stroke="none"/><circle cx="100" cy="150" r="40" stroke-opacity="0.22" stroke-dasharray="4 9"/><circle cx="100" cy="150" r="27" fill="currentColor" fill-opacity="0.3"/><circle cx="100" cy="150" r="27"/><path d="M91 150h18M100 141v18" stroke="#fff" stroke-width="3.5"/></svg>`,
  // Two devices each to its OWN node (check) split by dashed wall — "1 proxy per account / isolated" (safe).
  "network-split": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M100 22v156" stroke-width="3" stroke-opacity="0.22" stroke-dasharray="6 11"/><rect x="20" y="30" width="50" height="36" rx="7" fill="currentColor" fill-opacity="0.16"/><path d="M20 58h50" stroke-opacity="0.6"/><rect x="130" y="30" width="50" height="36" rx="7" fill="currentColor" fill-opacity="0.16"/><path d="M130 58h50" stroke-opacity="0.6"/><path d="M45 66v42M155 66v42" stroke-width="3.5" stroke-opacity="0.55"/><circle cx="45" cy="142" r="25" fill="currentColor" fill-opacity="0.28"/><circle cx="45" cy="142" r="25"/><path d="M35 142l7 7 13-15" stroke="#fff" stroke-width="3.5"/><circle cx="155" cy="142" r="25" fill="currentColor" fill-opacity="0.28"/><circle cx="155" cy="142" r="25"/><path d="M145 142l7 7 13-15" stroke="#fff" stroke-width="3.5"/></svg>`,
  // 2×2 grid of filled profile cards w/ avatar, body, status dot — multi-account.
  "account-grid": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><g><rect x="24" y="24" width="68" height="68" rx="10" fill="currentColor" fill-opacity="0.32"/><rect x="24" y="24" width="68" height="68" rx="10"/><circle cx="46" cy="48" r="10" fill="#fff" fill-opacity="0.92" stroke="none"/><path d="M33 78c0-9 6-15 13-15s13 6 13 15" stroke="#fff" stroke-opacity="0.7" stroke-width="3"/><circle cx="80" cy="36" r="4" fill="#fff" stroke="none"/></g><g><rect x="108" y="24" width="68" height="68" rx="10" fill="currentColor" fill-opacity="0.24"/><rect x="108" y="24" width="68" height="68" rx="10"/><circle cx="130" cy="48" r="10" fill="#fff" fill-opacity="0.8" stroke="none"/><path d="M117 78c0-9 6-15 13-15s13 6 13 15" stroke="#fff" stroke-opacity="0.6" stroke-width="3"/><circle cx="164" cy="36" r="4" fill="#fff" fill-opacity="0.8" stroke="none"/></g><g><rect x="24" y="108" width="68" height="68" rx="10" fill="currentColor" fill-opacity="0.2"/><rect x="24" y="108" width="68" height="68" rx="10"/><circle cx="46" cy="132" r="10" fill="#fff" fill-opacity="0.72" stroke="none"/><path d="M33 162c0-9 6-15 13-15s13 6 13 15" stroke="#fff" stroke-opacity="0.55" stroke-width="3"/><circle cx="80" cy="120" r="4" fill="#fff" fill-opacity="0.7" stroke="none"/></g><g><rect x="108" y="108" width="68" height="68" rx="10" fill="currentColor" fill-opacity="0.15"/><rect x="108" y="108" width="68" height="68" rx="10"/><circle cx="130" cy="132" r="10" fill="#fff" fill-opacity="0.62" stroke="none"/><path d="M117 162c0-9 6-15 13-15s13 6 13 15" stroke="#fff" stroke-opacity="0.5" stroke-width="3"/><circle cx="164" cy="120" r="4" fill="#fff" fill-opacity="0.6" stroke="none"/></g></svg>`,
  // Filled warning triangle, bold white "!", radiating ticks + sparkle — risk / ban.
  "warning": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M100 32L180 168a7 7 0 01-6 10H26a7 7 0 01-6-10z" fill="currentColor" fill-opacity="0.18"/><path d="M100 32L180 168a7 7 0 01-6 10H26a7 7 0 01-6-10z"/><path d="M100 86v40" stroke="#fff" stroke-width="6"/><circle cx="100" cy="150" r="4.5" fill="#fff" stroke="none"/><g stroke="#fff" stroke-opacity="0.45" stroke-width="3"><path d="M158 70l14-10M42 70l-14-10M100 26V12"/></g><path d="M168 96l2.2 6.6 6.6 2.2-6.6 2.2-2.2 6.6-2.2-6.6-6.6-2.2 6.6-2.2z" fill="#fff" fill-opacity="0.7" stroke="none"/></svg>`,
  // Filled shield w/ bold white check, sheen + sparkles — protected / safe practice.
  "shield-check": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M100 20l68 26v48c0 44-30 70-68 84-38-14-68-40-68-84V46z" fill="currentColor" fill-opacity="0.2"/><path d="M100 20l68 26v48c0 44-30 70-68 84-38-14-68-40-68-84V46z"/><path d="M100 20l68 26v12l-68-26z" fill="#fff" fill-opacity="0.14" stroke="none"/><path d="M70 100l20 22 40-46" stroke="#fff" stroke-width="6.5"/><path d="M158 40l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" fill="#fff" fill-opacity="0.75" stroke="none"/><path d="M40 150l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z" fill="#fff" fill-opacity="0.55" stroke="none"/></svg>`,
  // Stacked coins w/ white $, top-coin sheen, up-arrow + sparkles — money / income.
  "coins": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M52 92v58c0 11 21 20 48 20s48-9 48-20V92" fill="currentColor" fill-opacity="0.2"/><path d="M52 92v58c0 11 21 20 48 20s48-9 48-20V92"/><ellipse cx="100" cy="122" rx="48" ry="18" stroke-opacity="0.45"/><ellipse cx="100" cy="92" rx="48" ry="18" fill="currentColor" fill-opacity="0.36"/><ellipse cx="100" cy="92" rx="48" ry="18"/><path d="M64 84a44 18 0 0124-14" stroke="#fff" stroke-opacity="0.5" stroke-width="3"/><path d="M100 76v34M90 84h14a6 6 0 010 12h-10a6 6 0 000 12h14" stroke="#fff" stroke-width="3.5"/><path d="M150 54l16-16 16 16M166 38v36" stroke="#fff" stroke-opacity="0.8" stroke-width="3.5"/><path d="M40 60l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff" fill-opacity="0.6" stroke="none"/></svg>`,
  // Three stacked browser windows, front one detailed (tabs, url bar, content) — profiles / channels.
  "browser-stack": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="52" y="34" width="116" height="80" rx="10" fill="currentColor" fill-opacity="0.1" stroke-opacity="0.4"/><rect x="37" y="54" width="116" height="80" rx="10" fill="currentColor" fill-opacity="0.12" stroke-opacity="0.55"/><rect x="22" y="74" width="116" height="92" rx="11" fill="currentColor" fill-opacity="0.28"/><rect x="22" y="74" width="116" height="92" rx="11"/><path d="M22 100h116"/><g fill="#fff" stroke="none"><circle cx="38" cy="87" r="3.5"/><circle cx="52" cy="87" r="3.5"/><circle cx="66" cy="87" r="3.5"/></g><rect x="36" y="112" width="66" height="11" rx="5.5" fill="#fff" fill-opacity="0.55" stroke="none"/><path d="M36 138h88M36 152h58" stroke="#fff" stroke-opacity="0.38" stroke-width="3"/></svg>`,
  // Filled funnel, input dots in / drop out, % flow — affiliate / conversion.
  "funnel": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M28 40h144L116 112v44l-32 18v-62z" fill="currentColor" fill-opacity="0.2"/><path d="M28 40h144L116 112v44l-32 18v-62z"/><path d="M28 40h144l-12 16H40z" fill="#fff" fill-opacity="0.12" stroke="none"/><g fill="#fff" stroke="none"><circle cx="64" cy="28" r="4"/><circle cx="100" cy="24" r="4"/><circle cx="136" cy="28" r="4"/></g><path d="M100 176v8" stroke="#fff" stroke-width="3.5"/><circle cx="100" cy="192" r="6" fill="#fff" fill-opacity="0.9" stroke="none"/></svg>`,
  // Balance scale w/ filled pans, beam, base — comparison / choice.
  "balance": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M100 36v118"/><path d="M70 174c0-16 14-22 30-22s30 6 30 22z" fill="currentColor" fill-opacity="0.24"/><path d="M70 174c0-16 14-22 30-22s30 6 30 22z"/><circle cx="100" cy="40" r="8" fill="currentColor" fill-opacity="0.4"/><circle cx="100" cy="40" r="8"/><path d="M36 56h128"/><path d="M30 56v8M170 56v8" stroke-opacity="0.5"/><path d="M36 56l-20 42a22 22 0 0044 0z" fill="currentColor" fill-opacity="0.22"/><path d="M36 56l-20 42a22 22 0 0044 0z"/><path d="M164 56l-20 42a22 22 0 0044 0z" fill="currentColor" fill-opacity="0.36"/><path d="M164 56l-20 42a22 22 0 0044 0z"/><path d="M154 78l9 9 16-18" stroke="#fff" stroke-width="3.5"/></svg>`,
  // Fingerprint ridges inside a scanner frame + white scan line — detection / fingerprint.
  "fingerprint": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><g stroke-opacity="0.5"><path d="M42 26H26v16M158 26h16v16M42 174H26v-16M158 174h16v-16"/></g><path d="M100 98a6 6 0 00-6 6c0 16 2 30 7 44"/><path d="M100 74a30 30 0 00-30 30c0 18 3 32 8 46"/><path d="M46 106a56 56 0 0192-42"/><path d="M156 104c0 8-1 18-3 26"/><path d="M128 104a28 28 0 00-46-21"/><path d="M128 106c0 22-4 40-11 56"/><path d="M52 120h96" stroke="#fff" stroke-opacity="0.85" stroke-width="3.5"/></svg>`,
  // Filled padlock w/ shackle, white keyhole, sparkle — security.
  "lock": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M64 92V66a36 36 0 0172 0v26" stroke-width="5"/><rect x="40" y="92" width="120" height="84" rx="16" fill="currentColor" fill-opacity="0.28"/><rect x="40" y="92" width="120" height="84" rx="16"/><path d="M40 110a120 30 0 01120 0" stroke="#fff" stroke-opacity="0.1" stroke-width="6"/><circle cx="100" cy="126" r="12" fill="#fff" fill-opacity="0.92" stroke="none"/><path d="M100 126v22" stroke="#fff" stroke-width="5"/><path d="M170 56l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" fill="#fff" fill-opacity="0.65" stroke="none"/></svg>`,
  // Shopping cart w/ items + up-arrow — e-commerce / online retail growth (TMĐT).
  "shopping-cart": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M50 66H176L160 118H66Z" fill="currentColor" fill-opacity="0.2"/><path d="M50 66H176L160 118H66Z"/><path d="M24 48H44L68 118"/><circle cx="78" cy="140" r="11" fill="currentColor" fill-opacity="0.3"/><circle cx="78" cy="140" r="11"/><circle cx="150" cy="140" r="11" fill="currentColor" fill-opacity="0.3"/><circle cx="150" cy="140" r="11"/><path d="M150 54l13-13 13 13M163 41v34" stroke="#fff" stroke-opacity="0.85" stroke-width="3.5"/><path d="M88 84h54M94 100h42" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/></svg>`,
  // User silhouette w/ a "no entry" badge — banned / suspended account (khóa nick).
  "ban-account": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="92" cy="84" r="28" fill="currentColor" fill-opacity="0.22"/><circle cx="92" cy="84" r="28"/><path d="M40 168c0-32 24-50 52-50s52 18 52 50" fill="currentColor" fill-opacity="0.16"/><path d="M40 168c0-32 24-50 52-50s52 18 52 50"/><circle cx="150" cy="52" r="28" fill="#0a0a0c" stroke="none"/><circle cx="150" cy="52" r="25" stroke="#fff" stroke-width="5"/><path d="M132 34l36 36" stroke="#fff" stroke-width="5"/></svg>`,
  // Bold © badge struck by impact bursts — copyright strike / claim (gậy bản
  // quyền). NOTE: no slash through the © — a slashed © means "no copyright"
  // (copyleft), the opposite meaning. Bursts convey the "hit/strike".
  "copyright-strike": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="100" cy="104" r="52" fill="currentColor" fill-opacity="0.22"/><circle cx="100" cy="104" r="52"/><path d="M121 88a27 27 0 100 33" stroke="#fff" stroke-width="7"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M100 40V20M150 58l14-14M50 58L36 44M164 104h20M36 104H16M150 150l14 14M50 150l-14 14"/></g><path d="M158 40l2.6 7.6 7.6 2.6-7.6 2.6L158 68l-2.6-7.6L147.8 56l7.6-2.6z" fill="#fff" fill-opacity="0.7" stroke="none"/></svg>`,
  // Clapperboard w/ play — video production / content (cắt cảnh, voiceover, làm nội dung).
  "film-cut": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="30" y="78" width="140" height="84" rx="9" fill="currentColor" fill-opacity="0.22"/><rect x="30" y="78" width="140" height="84" rx="9"/><path d="M32 78l7-26h132l-7 26z" fill="currentColor" fill-opacity="0.36"/><path d="M32 78l7-26h132l-7 26z"/><g stroke="#fff" stroke-opacity="0.6" stroke-width="5"><path d="M62 52l-7 26M96 52l-7 26M130 52l-7 26M164 52l-7 26"/></g><path d="M88 104l32 18-32 18z" fill="#fff" fill-opacity="0.88" stroke="none"/></svg>`,
  // Monitor/screen w/ play button + stand — single video / content.
  "video-play": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="26" y="42" width="148" height="102" rx="14" fill="currentColor" fill-opacity="0.22"/><rect x="26" y="42" width="148" height="102" rx="14"/><path d="M84 72l38 21-38 21z" fill="#fff" fill-opacity="0.9" stroke="none"/><path d="M72 164h56M100 144v20" stroke-opacity="0.6"/></svg>`,
  // Three stacked play screens — multiple channels / accounts.
  "channels-multi": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="56" y="28" width="114" height="68" rx="12" fill="currentColor" fill-opacity="0.1" stroke-opacity="0.42"/><rect x="40" y="50" width="120" height="72" rx="12" fill="currentColor" fill-opacity="0.14" stroke-opacity="0.6"/><rect x="24" y="74" width="128" height="82" rx="14" fill="currentColor" fill-opacity="0.28"/><rect x="24" y="74" width="128" height="82" rx="14"/><path d="M74 100l34 18-34 18z" fill="#fff" fill-opacity="0.9" stroke="none"/></svg>`,
  // Envelope — email / messages.
  "email-big": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="26" y="50" width="148" height="104" rx="14" fill="currentColor" fill-opacity="0.2"/><rect x="26" y="50" width="148" height="104" rx="14"/><path d="M32 62l68 48 68-48" stroke="#fff" stroke-opacity="0.85" stroke-width="3.5"/><path d="M32 144l46-40M168 144l-46-40" stroke-opacity="0.4"/></svg>`,
  // Globe w/ meridians + two connected server nodes — proxy / IP / routing / geo.
  "proxy-globe": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="100" cy="100" r="66" fill="currentColor" fill-opacity="0.16"/><circle cx="100" cy="100" r="66"/><path d="M34 100h132" stroke-opacity="0.65"/><path d="M100 34c28 22 28 110 0 132M100 34c-28 22-28 110 0 132" stroke-opacity="0.65"/><ellipse cx="100" cy="100" rx="32" ry="66" stroke-opacity="0.45"/><path d="M64 78l72 44" stroke="#fff" stroke-opacity="0.55" stroke-width="3"/><g fill="#fff" stroke="none"><circle cx="64" cy="78" r="6"/><circle cx="136" cy="122" r="6"/></g></svg>`,
  // Rocket w/ fins + flame — launch / scale / fast growth.
  "rocket": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M100 22c27 19 39 48 39 80l-17 18H78l-17-18c0-32 12-61 39-80z" fill="currentColor" fill-opacity="0.22"/><path d="M100 22c27 19 39 48 39 80l-17 18H78l-17-18c0-32 12-61 39-80z"/><circle cx="100" cy="84" r="15" fill="#fff" fill-opacity="0.9" stroke="none"/><path d="M78 122l-22 18 7-32M122 122l22 18-7-32" fill="currentColor" fill-opacity="0.28"/><path d="M78 122l-22 18 7-32M122 122l22 18-7-32"/><path d="M86 148c0 13 6 24 14 32 8-8 14-19 14-32" stroke="#fff" stroke-opacity="0.7"/></svg>`,
  // Bullseye + incoming arrow — goal / conversion / targeting.
  "target": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="94" cy="106" r="62" fill="currentColor" fill-opacity="0.14"/><circle cx="94" cy="106" r="62"/><circle cx="94" cy="106" r="39" stroke-opacity="0.8"/><circle cx="94" cy="106" r="17" fill="currentColor" fill-opacity="0.4"/><circle cx="94" cy="106" r="17"/><circle cx="94" cy="106" r="5" fill="#fff" stroke="none"/><path d="M94 106l62-62M150 28h18v18" stroke="#fff" stroke-opacity="0.85" stroke-width="3.5"/></svg>`,
  // Clock — time / slow / schedule.
  "clock": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="100" cy="106" r="64" fill="currentColor" fill-opacity="0.18"/><circle cx="100" cy="106" r="64"/><path d="M100 64v42l28 18" stroke="#fff" stroke-width="5"/><g stroke-opacity="0.55"><path d="M100 50v8M156 106h-8M100 162v-8M44 106h8"/></g><path d="M82 26h36"/></svg>`,
  // Megaphone w/ sound waves — marketing / ads / announce (quảng cáo).
  "megaphone": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M38 84v34l26 6v24h18v-20l68 22V56l-68 22H64z" fill="currentColor" fill-opacity="0.22"/><path d="M38 84v34l26 6v24h18v-20l68 22V56l-68 22H64z"/><path d="M150 78v44" stroke-opacity="0.5"/><g stroke="#fff" stroke-opacity="0.7"><path d="M166 70l16-8M172 100h18M166 130l16 8"/></g></svg>`,
  // Wallet w/ card + coin — income / earnings / money.
  "wallet": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="30" y="56" width="140" height="98" rx="16" fill="currentColor" fill-opacity="0.22"/><rect x="30" y="56" width="140" height="98" rx="16"/><path d="M30 84h122a8 8 0 018 8v22a8 8 0 01-8 8H30" stroke-opacity="0.45"/><circle cx="148" cy="110" r="9" fill="#fff" fill-opacity="0.9" stroke="none"/><path d="M48 56l68-22 18 22" stroke-opacity="0.5"/></svg>`,
  // Document w/ lines + corner fold — report / guide / AdSense / contract.
  "document-big": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M52 24h64l34 34v118H52z" fill="currentColor" fill-opacity="0.2"/><path d="M52 24h64l34 34v118H52z"/><path d="M116 24v34h34" stroke-opacity="0.6"/><path d="M70 98h60M70 120h60M70 142h38" stroke="#fff" stroke-opacity="0.5" stroke-width="3.5"/><path d="M70 74h26" stroke-opacity="0.6"/></svg>`,
  // Two interlocked chain links — affiliate / partnership / referral link.
  "affiliate-link": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M86 114l28-28" stroke="#fff" stroke-width="4.5"/><path d="M98 70l12-12a32 32 0 0145 45l-20 20a32 32 0 01-45 0" fill="currentColor" fill-opacity="0.16"/><path d="M98 70l12-12a32 32 0 0145 45l-20 20a32 32 0 01-45 0"/><path d="M102 130l-12 12a32 32 0 01-45-45l20-20a32 32 0 0145 0" fill="currentColor" fill-opacity="0.16"/><path d="M102 130l-12 12a32 32 0 01-45-45l20-20a32 32 0 0145 0"/></svg>`,
  // 3D box w/ motion lines — shipping / dropshipping / fulfillment.
  "dropship-box": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M96 34l58 31v62l-58 31-58-31V65z" fill="currentColor" fill-opacity="0.2"/><path d="M96 34l58 31v62l-58 31-58-31V65z"/><path d="M38 65l58 31 58-31M96 96v62" stroke-opacity="0.7"/><path d="M68 49l58 31" stroke-opacity="0.4"/><g stroke="#fff" stroke-opacity="0.5"><path d="M158 120h22M164 138h16M160 156h20"/></g></svg>`,
  // Two meshing gears — setup / automation / system (cấu hình).
  "gears": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="80" cy="82" r="26" fill="currentColor" fill-opacity="0.22"/><circle cx="80" cy="82" r="26"/><circle cx="80" cy="82" r="9" fill="#fff" fill-opacity="0.85" stroke="none"/><g stroke-width="6"><path d="M80 48v-10M80 126v-10M118 82h10M32 82h10M105 57l7-7M48 114l7-7M105 107l7 7M48 50l7 7"/></g><circle cx="140" cy="136" r="20" fill="currentColor" fill-opacity="0.28"/><circle cx="140" cy="136" r="20"/><circle cx="140" cy="136" r="7" fill="#fff" fill-opacity="0.8" stroke="none"/><g stroke-width="5"><path d="M140 108v-8M140 172v-8M170 136h8M102 136h8M160 116l6-6M114 156l6 6M160 156l6 6M114 116l6-6"/></g></svg>`,
  // Magnifier — research / search / inspection / detection.
  "search": `<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="88" cy="86" r="48" fill="currentColor" fill-opacity="0.18"/><circle cx="88" cy="86" r="48"/><path d="M122 120l46 46" stroke-width="9"/><path d="M66 86a22 22 0 0122-22" stroke="#fff" stroke-opacity="0.6" stroke-width="3.5"/></svg>`,
};

// Small bold glyphs used as per-bullet markers in feature lists (24×24 viewBox,
// legible at chip size). Single-tone (currentColor) so they stay crisp small.
const BULLET_ICONS: Record<string, string> = {
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6"/><path d="M11 6l1.2-1.2a4 4 0 015.7 5.7L16 13"/><path d="M13 18l-1.2 1.2a4 4 0 01-5.7-5.7L8 11"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.2-5.6 7-5.6s7 2 7 5.6"/></svg>`,
  ban: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/></svg>`,
  fingerprint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11.5a1.8 1.8 0 00-1.8 1.8c0 2.4.4 4 1.2 5.7"/><path d="M12 7.5a5.5 5.5 0 00-5.5 5.5c0 2.6.5 4.4 1.4 6.4"/><path d="M5.5 9a8 8 0 0113 4"/><path d="M18.5 13.5c0 1.6-.2 3.2-.8 4.7"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6V3z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16.5h6"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.6 9.4h3.4a1.9 1.9 0 010 3.8H10a1.9 1.9 0 000 3.8h3.4"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 2.5v5.5c0 4.5-3 7-7 8-4-1-7-3.5-7-8V5.5L12 3z"/><path d="M9 12l2 2 4-4"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>`,
};

function renderIllustration(key: string | undefined): string {
  if (!key) return "";
  const svg = ILLUSTRATIONS[key];
  if (!svg) return "";
  return `<div class="scene-illu">${svg}</div>`;
}


// Default TikTok config — EMPTY by design. An empty handle suppresses both the
// footer "♪ @handle" pill AND the outro follow card, so brand videos ship
// clean (no leftover demo channel). To show a real channel, set TIKTOK_HANDLE
// / TIKTOK_DISPLAY_NAME / TIKTOK_FOLLOWERS in env or pass a tiktok config.
const DEFAULT_TIKTOK: TiktokConfig = {
  displayName: "",
  handle: "",
  followers: "",
};

// ── Style whitelists + ratio resolution ────────────────────────────────────
export const VALID_THEMES = [
  "tech-blue", "growth-green", "finance-gold",
  "creator-purple", "news-mono", "playful-orange", "cloak-orange",
] as const;
export type ThemeKey = (typeof VALID_THEMES)[number];

export const VALID_ASPECTS = ["9:16", "16:9", "1:1"] as const;
export type Aspect = (typeof VALID_ASPECTS)[number];

export const VALID_CHARACTERS = [
  "none", "alice", "minh", "linh", "huy", "mai", "neutral", "custom",
] as const;
export type CharacterId = (typeof VALID_CHARACTERS)[number];

export interface AspectDims { w: number; h: number; scale: number }

export const ASPECT_DIMS: Record<Aspect, AspectDims> = {
  "9:16": { w: 1080, h: 1920, scale: 1.0 },
  "16:9": { w: 1920, h: 1080, scale: 0.75 },
  "1:1":  { w: 1080, h: 1080, scale: 0.88 },
};

function pickTheme(v: string | undefined): ThemeKey {
  return (VALID_THEMES as readonly string[]).includes(v ?? "") ? (v as ThemeKey) : "news-mono";
}
function pickAspect(v: string | undefined): Aspect {
  return (VALID_ASPECTS as readonly string[]).includes(v ?? "") ? (v as Aspect) : "9:16";
}
function pickCharacter(v: string | undefined): CharacterId {
  return (VALID_CHARACTERS as readonly string[]).includes(v ?? "") ? (v as CharacterId) : "none";
}

export interface SceneAudio {
  id: string;
  durationSec: number;
}

export interface ComposeArgs {
  script: Script;
  sceneAudio: SceneAudio[];
  gapSec: number;
  bgImageRelPath: string | null;   // null => no image available
  audioRelPath: string;
  /** TikTok follow card config (injected into outro scene). Optional — defaults used if omitted. */
  tiktok?: TiktokConfig;
  /** Relative path to avatar image inside the output dir (e.g. "tiktok-avatar.jpg"). */
  tiktokAvatarRelPath?: string;
  /** Extra seconds added to outro scene visual duration after voice ends (TikTok card hold). Default 3. */
  outroHoldSec?: number;
  /**
   * Optional per-scene b-roll video paths (relative to output dir, e.g.
   * "broll/scene-hook.mp4"). When present for a scene, replaces the
   * static-image/gradient bg with an autoplay-muted-loop <video> element.
   */
  sceneBroll?: Record<string, string | null>;
  /** Visual theme key. Falls back to "news-mono". */
  themeKey?: string;
  /** Output aspect ratio. Falls back to "9:16" (1080×1920). */
  aspect?: string;
  /** Host character preset id. "none" or undefined hides the overlay. */
  character?: string;
  /**
   * Relative path (inside output dir) to a custom face PNG/SVG for
   * character==="custom". Composer assumes the file is already copied
   * into the workdir by the pipeline. Falls back to neutral preset.
   */
  customCharacterAsset?: string;
}

export function composeHtml(args: ComposeArgs): string {
  const { script, sceneAudio, gapSec, bgImageRelPath, audioRelPath } = args;
  const tiktok = args.tiktok ?? DEFAULT_TIKTOK;
  const tiktokAvatar = args.tiktokAvatarRelPath ?? "tiktok-avatar.jpg";
  const outroHoldSec = args.outroHoldSec ?? 3;
  const sceneBroll = args.sceneBroll ?? {};

  // ── Resolve style ──────────────────────────────────────────────────────
  const themeKey = pickTheme(args.themeKey ?? script.style?.themeKey);
  const aspect = pickAspect(args.aspect ?? script.style?.aspect);
  const character = pickCharacter(args.character ?? script.style?.character);
  const { w: stageW, h: stageH, scale } = ASPECT_DIMS[aspect];

  // Compute timing per scene. Outro scene gets extra HOLD seconds so the
  // TikTok follow card stays visible after the voice ends.
  let cursor = 0;
  const timing = script.scenes.map((scene) => {
    const audio = sceneAudio.find((a) => a.id === scene.id);
    if (!audio) throw new Error(`No audio entry for scene id=${scene.id}`);
    const isOutro = scene.type === "outro";
    const dur = audio.durationSec + gapSec + (isOutro ? outroHoldSec : 0);
    const start = cursor;
    cursor += dur;
    return { scene, start, duration: dur, voiceDur: audio.durationSec };
  });
  const totalDuration = cursor;

  // Render scenes — each scene now returns { brollHtml, sceneHtml }. B-roll
  // <video> elements MUST be direct children of #stage (not nested inside the
  // scene's `<div class="scene clip" data-start>` wrapper) — otherwise
  // HyperFrames lints `video_nested_in_timed_element` and the worker times
  // out at frame-capture stage because the framework refuses to play the
  // video and HTMLVideoElement never fires `loadedmetadata`.
  const renderedScenes = timing.map(({ scene, start, duration, voiceDur }) => {
    const broll = sceneBroll[scene.id] ?? null;
    return renderScene(scene, start, duration, voiceDur, bgImageRelPath, tiktok, tiktokAvatar, broll);
  });
  const brollHtml = renderedScenes.map((r) => r.brollHtml).filter(Boolean).join("\n");
  const sceneHtml = renderedScenes.map((r) => r.sceneHtml).join("\n");

  // Persistent shell — uses tiktok handle in footer
  const shellHtml = renderShell(script.metadata, tiktok);

  const animJs = readFileSync(join(TPL_DIR, "animations.js"), "utf8");

  // ── Host overlay ─────────────────────────────────────────────────────
  const hostOverlayHtml = renderHostOverlay(character, args.customCharacterAsset);

  const tpl = readFileSync(join(TPL_DIR, "base.html.tmpl"), "utf8");
  return tpl
    .replace("{{TITLE}}", escapeHtml(script.metadata.title))
    .replace(/\{\{TOTAL_DURATION\}\}/g, totalDuration.toFixed(2))
    .replace("{{SHELL}}", shellHtml)
    .replace("{{BROLLS}}", brollHtml)
    .replace("{{SCENES}}", sceneHtml)
    .replace("{{HOST_OVERLAY}}", hostOverlayHtml)
    .replace(/\{\{THEME_KEY\}\}/g, themeKey)
    .replace(/\{\{ASPECT\}\}/g, aspect)
    .replace(/\{\{CHARACTER_ID\}\}/g, character)
    .replace(/\{\{STAGE_W\}\}/g, String(stageW))
    .replace(/\{\{STAGE_H\}\}/g, String(stageH))
    .replace(/\{\{SCALE\}\}/g, String(scale))
    .replace(/src="voice\.mp3"/g, `src="${audioRelPath}"`)
    .replace('<script src="animations.js"></script>', `<script>\n${animJs}\n</script>`);
}

// ── HOST OVERLAY ───────────────────────────────────────────────────────────
function renderHostOverlay(character: CharacterId, customAsset?: string): string {
  if (character === "none") return "";

  // For 'custom': caller copied user file into output dir; we still reference
  // the bundled mouth overlay (neutral) because we don't know where the user's
  // mouth pixels are. For preset characters we reference avatars/<id>.svg
  // shipped alongside the rendered output (pipeline copies these in).
  let faceSrc: string;
  let mouthSrc: string;
  if (character === "custom") {
    // Strict relative-path whitelist: segments of `[A-Za-z0-9._-]+` separated
    // by exactly one `/`. The leading `(?!.*\.\.)` lookahead rejects any
    // `..` substring outright, blocking path traversal at the pattern
    // level. No leading `/`, no backslash, no UNC, no absolute paths.
    const SAFE_REL_PATH = /^(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
    const safe =
      typeof customAsset === "string" &&
      customAsset.length > 0 &&
      customAsset.length <= 200 &&
      SAFE_REL_PATH.test(customAsset);
    faceSrc = safe ? customAsset! : "avatars/neutral.svg";
    mouthSrc = "avatars/neutral-mouth.svg";
  } else {
    faceSrc = `avatars/${character}.svg`;
    mouthSrc = `avatars/${character}-mouth.svg`;
  }

  const blockTpl = readFileSync(join(BLOCKS_DIR, "host-overlay.html"), "utf8");
  return blockTpl
    .replace("{{HOST_FACE_SRC}}", escapeAttr(faceSrc))
    .replace("{{HOST_MOUTH_SRC}}", escapeAttr(mouthSrc));
}

// ── PERSISTENT SHELL ───────────────────────────────────────────────────────
function renderShell(metadata: Script["metadata"], tiktok: TiktokConfig): string {
  const channel = escapeHtml(metadata.channel);
  const tagline = escapeHtml((metadata.tagline ?? DEFAULT_TAGLINE).trim() || DEFAULT_TAGLINE);
  const logoSrc = brandLogoDataUri();
  const rawHandle = (tiktok.handle ?? "").trim();
  // Empty handle ("" or unset) suppresses the brand-shell-handle pill so
  // VietViral builds (which don't carry the ACV tester's @haiquep handle)
  // ship a clean frame. To show your own handle, set `TIKTOK_HANDLE` in
  // .env.local or pass it through from the host app.
  const handleHtml = rawHandle
    ? `
<div class="brand-shell-handle">
  <span class="handle-music">&#9835;</span>
  <span class="handle-text">${escapeHtml(rawHandle)}</span>
</div>`
    : "";
  return `
<!-- Shell: persistent brand elements (no data-start → always visible) -->
<div class="shell-bg">${FLOAT_ICONS_HTML}</div>

<div class="brand-shell-header">
  <div class="brand-icon"><img class="brand-logo" src="${logoSrc}" alt="${channel}" /></div>
  <div class="brand-text">
    <div class="brand-name">${channel}</div>
    <div class="brand-tag">${tagline}</div>
  </div>
</div>
${handleHtml}

${GRAIN_OVERLAY_HTML}`.trim();
}

// ── SCENE DISPATCH ─────────────────────────────────────────────────────────
function renderScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  voiceDur: number,
  bgImageRelPath: string | null,
  tiktok: TiktokConfig,
  tiktokAvatarRelPath: string,
  brollRelPath: string | null,
): { brollHtml: string | null; sceneHtml: string } {
  const td = scene.templateData;

  let inner: string;
  let layoutName: string;

  switch (td.template) {
    case "hook":
      // When b-roll is present for hook, skip the image/gradient bg —
      // the stage-level <video> + .bg-overlay (emitted separately, see
      // brollHtml return) replaces it. The shimmer-sweep and headline
      // still read because .bg-overlay applies the same dark gradient
      // as the legacy `.overlay` element.
      inner = renderHookInner(td, bgImageRelPath, brollRelPath !== null);
      layoutName = "hook";
      break;
    case "comparison":
      inner = renderComparisonInner(td);
      layoutName = "comparison";
      break;
    case "stat-hero":
      inner = renderStatHeroInner(td);
      layoutName = "stat-hero";
      break;
    case "feature-list":
      inner = renderFeatureListInner(td);
      layoutName = "feature-list";
      break;
    case "callout":
      inner = renderCalloutInner(td);
      layoutName = "callout";
      break;
    case "outro":
      inner = renderOutroInner(td, tiktok, tiktokAvatarRelPath);
      layoutName = "outro";
      break;
    default: {
      const _never: never = td;
      throw new Error(`Unknown template: ${(_never as any).template}`);
    }
  }

  // CRITICAL: HyperFrames refuses to play any <video data-start> nested
  // inside an element that also has data-start (the scene `<div class="scene
  // clip" data-start>`). Symptom: at the FrameCapture stage all workers fail
  // with "video metadata not ready after 45000ms".
  //
  // Emit the b-roll <video> and its dark overlay at STAGE LEVEL (returned as
  // `brollHtml`) so the framework can manage the clip's playhead directly.
  // The scene wrapper retains data-start for the GSAP layout-card animations
  // but no longer contains the video. CSS `.bg-broll { position:absolute;
  // inset:0; }` keeps the video pinned to the stage just like before.
  const brollHtml = brollRelPath
    ? brollClipForStage(scene.id, brollRelPath, start, duration)
    : null;
  // Large per-scene illustration (upper zone). Absolute-positioned, so its
  // place in the markup doesn't affect the centered layout content.
  const illuHtml = renderIllustration(scene.illustration);
  return {
    brollHtml,
    sceneHtml: buildScene(scene, start, duration, voiceDur, layoutName, illuHtml + inner),
  };
}

/**
 * Emit a stage-level b-roll <video> + matching bg-overlay <div>, both timed
 * by `data-start`/`data-duration` so HyperFrames manages visibility.
 *
 * - `id="broll-<sceneId>"` satisfies HyperFrames' "media_missing_id" lint
 *   (the framework requires an id to discover and drive the element).
 * - `class="clip"` opts the element in to HyperFrames' time-managed display
 *   (visible only during the data-start..data-start+data-duration window).
 * - `preload="auto"` is correct: HyperFrames PAUSES the timeline and seeks
 *   per frame, then captures. With preload="metadata" each seek triggers
 *   progressive download → more I/O total, NOT less. Auto loads the whole
 *   file up front (~2-8MB SD portrait) so seeks resolve from decoded memory
 *   immediately. Measured: metadata → 7m23s for 28s render vs auto → 5m9s.
 */
function brollClipForStage(
  sceneId: string,
  relPath: string,
  startSec: number,
  durationSec: number,
): string {
  const start = startSec.toFixed(2);
  const dur = durationSec.toFixed(2);
  // Sanitize sceneId for use in HTML id (already validated upstream but
  // cheap defence-in-depth).
  const safeId = sceneId.replace(/[^A-Za-z0-9_-]/g, "");
  return [
    `<video class="bg bg-broll clip" id="broll-${safeId}" data-start="${start}" data-duration="${dur}" data-volume="0" loop muted playsinline preload="auto" src="${escapeAttr(relPath)}"></video>`,
    `<div class="bg-overlay clip" data-start="${start}" data-duration="${dur}"></div>`,
  ].join("");
}

// ── HOOK SCENE ─────────────────────────────────────────────────────────────
function renderHookInner(
  td: Extract<TemplateDataType, { template: "hook" }>,
  bgImageRelPath: string | null,
  hasBroll: boolean,
): string {
  // When b-roll is present, renderScene prepends the <video> bg + overlay,
  // so we skip the image/gradient layer entirely here (otherwise the
  // legacy `.bg` div would stack above the b-roll).
  let bgHtml: string;
  let overlayHtml: string;
  if (hasBroll) {
    bgHtml = "";
    overlayHtml = "";
  } else if (td.bgSrc && bgImageRelPath) {
    const kbClass = td.kenBurns ?? "zoom-in";
    bgHtml = `<div class="bg kb-${kbClass}" style="background-image: url('${bgImageRelPath}')"></div>`;
    overlayHtml = `<div class="overlay" style="opacity: 0.55"></div>`;
  } else {
    bgHtml = `<div class="bg gradient-news-dark"></div>`;
    overlayHtml = `<div class="overlay" style="opacity: 0.55"></div>`;
  }

  const headline = escapeHtml(td.headline);
  const subhead = td.subhead ? escapeHtml(td.subhead) : "";

  return `${bgHtml}
  ${overlayHtml}
  <div class="layout-hook">
    <div class="hook-headline shimmer-sweep-target">${headline}</div>
    ${subhead ? `<div class="hook-subhead">${subhead}</div>` : ""}
  </div>`;
}

// ── COMPARISON SCENE ───────────────────────────────────────────────────────
function renderComparisonInner(td: Extract<TemplateDataType, { template: "comparison" }>): string {
  const lColor = td.left.color;  // "cyan" | "purple"
  const rColor = td.right.color;
  const winnerClass = td.right.winner ? " card-winner" : "";

  return `
<div class="layout-comparison">
  <div class="cmp-card cmp-left color-${lColor}">
    <div class="cmp-label">${escapeHtml(td.left.label)}</div>
    <div class="cmp-value">${escapeHtml(td.left.value)}</div>
  </div>
  <div class="cmp-vs">VS</div>
  <div class="cmp-card cmp-right color-${rColor}${winnerClass}">
    <div class="cmp-label">${escapeHtml(td.right.label)}</div>
    <div class="cmp-value">${escapeHtml(td.right.value)}</div>
    ${td.right.winner ? '<div class="cmp-winner-badge">WINNER</div>' : ""}
  </div>
</div>`.trim();
}

// ── STAT HERO SCENE ────────────────────────────────────────────────────────
function renderStatHeroInner(td: Extract<TemplateDataType, { template: "stat-hero" }>): string {
  const context = td.context ? `<div class="stat-context">${escapeHtml(td.context)}</div>` : "";
  return `
<div class="layout-stat-hero">
  <div class="stat-value shimmer-sweep-target">${escapeHtml(td.value)}</div>
  <div class="stat-label">${escapeHtml(td.label)}</div>
  ${context}
</div>`.trim();
}

// ── FEATURE LIST SCENE ─────────────────────────────────────────────────────
function renderFeatureListInner(td: Extract<TemplateDataType, { template: "feature-list" }>): string {
  const bullets = td.bullets.map((b, i) => {
    // Bullets are either a plain string or { text, icon } — normalize.
    const text = typeof b === "string" ? b : b.text;
    const iconKey = typeof b === "string" ? undefined : b.icon;
    const glyph = iconKey ? BULLET_ICONS[iconKey] : undefined;
    const marker = glyph
      ? `<div class="feat-ico">${glyph}</div>`
      : `<div class="feat-dot"></div>`;
    return `<div class="feat-bullet feat-bullet-${i}" data-idx="${i}">
      ${marker}
      <div class="feat-text">${escapeHtml(text)}</div>
    </div>`;
  }).join("\n    ");

  return `
<div class="layout-feature-list">
  <div class="feat-card">
    <div class="feat-title">${escapeHtml(td.title)}</div>
    <div class="feat-rule"></div>
    <div class="feat-bullets">
      ${bullets}
    </div>
  </div>
</div>`.trim();
}

// ── CALLOUT SCENE ──────────────────────────────────────────────────────────
function renderCalloutInner(td: Extract<TemplateDataType, { template: "callout" }>): string {
  const tag = td.tag ? `<div class="callout-tag">${escapeHtml(td.tag)}</div>` : "";
  return `
<div class="layout-callout">
  <div class="callout-card">
    ${tag}
    <div class="callout-statement">${escapeHtml(td.statement)}</div>
  </div>
</div>`.trim();
}

// ── OUTRO SCENE ────────────────────────────────────────────────────────────
function renderOutroInner(
  td: Extract<TemplateDataType, { template: "outro" }>,
  tiktok: TiktokConfig,
  avatarRelPath: string,
): string {
  // Only render the follow card when a real channel handle is configured.
  // Empty handle (the default) → no card, so brand videos ship without the
  // leftover demo channel ("@congnghe24h / Following / 1.2M followers").
  const ttCard = (tiktok.handle ?? "").trim() ? renderTiktokCard(tiktok, avatarRelPath) : "";
  return `
<div class="layout-outro">
  <div class="out-cta-top">${escapeHtml(td.ctaTop)}</div>
  <div class="out-channel">${escapeHtml(td.channelName)}</div>
  <div class="out-underline"></div>
  <div class="out-source">Nguồn: ${escapeHtml(td.source)}</div>
</div>
${ttCard}`.trim();
}

/**
 * TikTok follow card — adapted from HyperFrames `tiktok-follow` block.
 * Slides up from bottom mid-outro. Animations are added by animations.js
 * targeting elements with id="tt-card", id="tt-follow-btn", etc.
 */
function renderTiktokCard(tiktok: TiktokConfig, avatarRelPath: string): string {
  return `
<div id="tt-card" class="tt-card">
  <img class="tt-avatar" src="${escapeHtml(avatarRelPath)}" alt="${escapeHtml(tiktok.displayName)}" crossorigin="anonymous" />
  <div class="tt-profile-info">
    <div class="tt-display-name">${escapeHtml(tiktok.displayName)}</div>
    <div class="tt-handle">${escapeHtml(tiktok.handle)}</div>
    <div class="tt-followers">${escapeHtml(tiktok.followers)}</div>
  </div>
  <div id="tt-follow-btn" class="tt-follow-btn">
    <span id="tt-btn-follow" class="tt-btn-text">Follow</span>
    <span id="tt-btn-following" class="tt-btn-text tt-btn-text-following">
      <span>Following</span>
      <span class="tt-check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
    </span>
  </div>
</div>`.trim();
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function buildScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  voiceDur: number,
  layoutName: string,
  innerHtml: string,
): string {
  const caption = renderCaption(scene.voiceText);
  // `has-illu` lets the CSS push tall layouts (feature-list) below the upper
  // illustration zone so the card never overlaps the graphic.
  const illuClass = scene.illustration && ILLUSTRATIONS[scene.illustration] ? " has-illu" : "";
  return `
<div class="scene clip${illuClass}" id="scene-${scene.id}"
     data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}"
     data-voice-dur="${voiceDur.toFixed(2)}" data-active="0"
     data-layout="${layoutName}">
  ${innerHtml}
  ${caption}
</div>`.trim();
}

/**
 * Split a voice line into short caption phrases (≤ ~28 chars each) so each
 * reads as a single mobile-friendly line. Breaks greedily on word boundaries
 * and forces a break after sentence-ending punctuation for natural phrasing.
 */
function splitCaption(text: string, maxChars = 34): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
    // Natural break after a sentence end (keeps phrases from running on).
    if (/[.!?]$/.test(w) && cur.length >= 8) {
      lines.push(cur);
      cur = "";
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Animated subtitle block — one phrase visible at a time, popped in/out by
 * animations.js across the scene's voice duration (karaoke-style motion like
 * the reference TikTok edits). Strips trailing punctuation from the displayed
 * text but keeps it for phrasing.
 */
function renderCaption(voiceText: string): string {
  const lines = splitCaption(voiceText);
  if (!lines.length) return "";
  const spans = lines
    .map(
      (l, i) =>
        `<span class="cap-line" data-i="${i}"><span class="cap-pill">${escapeHtml(l)}</span></span>`,
    )
    .join("");
  return `<div class="caption" data-lines="${lines.length}">${spans}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** HTML attribute value escaper (double-quoted attrs). Strict subset of escapeHtml. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
