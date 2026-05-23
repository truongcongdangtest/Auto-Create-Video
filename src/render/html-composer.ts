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

// Default TikTok config (used if not passed)
const DEFAULT_TIKTOK: TiktokConfig = {
  displayName: "Công nghệ 24h",
  handle: "@congnghe24h",
  followers: "1.2M followers",
};

// ── Style whitelists + ratio resolution ────────────────────────────────────
export const VALID_THEMES = [
  "tech-blue", "growth-green", "finance-gold",
  "creator-purple", "news-mono", "playful-orange",
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
    return { scene, start, duration: dur };
  });
  const totalDuration = cursor;

  // Render scenes — each scene now returns { brollHtml, sceneHtml }. B-roll
  // <video> elements MUST be direct children of #stage (not nested inside the
  // scene's `<div class="scene clip" data-start>` wrapper) — otherwise
  // HyperFrames lints `video_nested_in_timed_element` and the worker times
  // out at frame-capture stage because the framework refuses to play the
  // video and HTMLVideoElement never fires `loadedmetadata`.
  const renderedScenes = timing.map(({ scene, start, duration }) => {
    const broll = sceneBroll[scene.id] ?? null;
    return renderScene(scene, start, duration, bgImageRelPath, tiktok, tiktokAvatar, broll);
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
  const domain = escapeHtml(metadata.source.domain);
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
<div class="shell-bg"></div>

<div class="brand-shell-header">
  <div class="brand-icon">&gt;_</div>
  <div class="brand-text">
    <div class="brand-name">${channel}</div>
    <div class="brand-tag">TIN CÔNG NGHỆ</div>
  </div>
</div>
${handleHtml}

<div class="brand-shell-keyword">
  <span>${escapeHtml(domain)}</span>
</div>

${GRAIN_OVERLAY_HTML}`.trim();
}

// ── SCENE DISPATCH ─────────────────────────────────────────────────────────
function renderScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
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
  return {
    brollHtml,
    sceneHtml: buildScene(scene, start, duration, layoutName, inner),
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
  const bullets = td.bullets.map((b, i) =>
    `<div class="feat-bullet feat-bullet-${i}" data-idx="${i}">
      <div class="feat-dot"></div>
      <div class="feat-text">${escapeHtml(b)}</div>
    </div>`
  ).join("\n    ");

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
  const ttCard = renderTiktokCard(tiktok, avatarRelPath);
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
  layoutName: string,
  innerHtml: string,
): string {
  return `
<div class="scene clip" id="scene-${scene.id}"
     data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}" data-active="0"
     data-layout="${layoutName}">
  ${innerHtml}
</div>`.trim();
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
