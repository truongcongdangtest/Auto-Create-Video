import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeHtml, VALID_THEMES, ASPECT_DIMS } from "./html-composer.js";
import type { Script } from "./script-schema.js";

describe("composeHtml", () => {
  it("produces deterministic HTML for sample script with image", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = [
      { id: "hook",   durationSec: 3.2 },
      { id: "body-1", durationSec: 11.5 },
      { id: "body-2", durationSec: 10.8 },
      { id: "body-3", durationSec: 12.1 },
      { id: "outro",  durationSec: 3.4 },
    ];
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
    });

    // ── HyperFrames structural requirements ──────────────────
    expect(html).toContain('id="stage"');
    expect(html).toContain('data-composition-id="news-video"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-height="1920"');
    expect(html).toContain('data-start="0"');
    expect(html).toContain('id="voice"');
    expect(html).toContain('class="scene clip"');
    expect(html).toContain('window.__timelines');

    // ── Style defaults (no style block → news-mono + 9:16 + none) ─
    expect(html).toContain('data-theme="news-mono"');
    expect(html).toContain('data-aspect="9:16"');
    expect(html).toContain('data-character="none"');
    expect(html).toContain('--stage-w:1080px');
    expect(html).toContain('--stage-h:1920px');
    expect(html).toContain('--scale:1');

    // ── Persistent brand shell ────────────────────────────────
    expect(html).toContain('class="brand-shell-header"');
    expect(html).toContain('class="brand-shell-handle"');
    expect(html).toContain('class="brand-shell-keyword"');
    expect(html).toContain('id="grain-overlay"');
    expect(html).toContain('class="brand-name"');
    expect(html).toContain("Công nghệ 24h");

    // ── Hook scene ─────────────────────────────────────────────
    expect(html).toContain('data-layout="hook"');
    expect(html).toContain('class="hook-headline shimmer-sweep-target"');
    expect(html).toContain("iPhone 17");
    expect(html).toContain("Camera 200MP!");

    expect(html).toContain('class="bg kb-zoom-in"');
    expect(html).toContain("background-image: url('images/bg.jpg')");

    // ── Body templates ─────────────────────────────────────────
    expect(html).toContain('data-layout="stat-hero"');
    expect(html).toContain('class="stat-value shimmer-sweep-target"');
    expect(html).toContain("200MP");

    expect(html).toContain('data-layout="feature-list"');
    expect(html).toContain('class="feat-card"');
    expect(html).toContain("Nâng cấp lớn");

    expect(html).toContain('data-layout="callout"');
    expect(html).toContain('class="callout-card"');

    // ── Outro scene ────────────────────────────────────────────
    expect(html).toContain('data-layout="outro"');
    expect(html).toContain('class="out-channel"');
    expect(html).toContain("Theo dõi ngay");

    expect(html).toContain('src="voice.mp3"');
    expect(html).toMatch(/data-duration="[\d.]+"/);
    expect(html).toContain("fonts.googleapis.com");

    // No host overlay when character=none
    expect(html).not.toContain('class="host-overlay"');
  });

  it("falls back to gradient when bgImageRelPath is null", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
    });
    expect(html).toContain('class="bg gradient-news-dark"');
    expect(html).not.toContain("background-image: url");
  });

  describe.each(VALID_THEMES)("theme=%s", (theme) => {
    it(`injects data-theme="${theme}" into <body>`, () => {
      const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
      const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
      const html = composeHtml({
        script,
        sceneAudio,
        gapSec: 0.3,
        bgImageRelPath: "images/bg.jpg",
        audioRelPath: "voice.mp3",
        themeKey: theme,
      });
      expect(html).toContain(`data-theme="${theme}"`);
    });
  });

  it("falls back to news-mono on unknown theme", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      themeKey: "garbage-theme",
    });
    expect(html).toContain('data-theme="news-mono"');
    expect(html).not.toContain('data-theme="garbage-theme"');
  });

  describe.each(["9:16", "16:9", "1:1"] as const)("aspect=%s", (aspect) => {
    it(`uses correct dimensions + scale for ${aspect}`, () => {
      const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
      const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
      const html = composeHtml({
        script,
        sceneAudio,
        gapSec: 0.3,
        bgImageRelPath: "images/bg.jpg",
        audioRelPath: "voice.mp3",
        aspect,
      });
      const dims = ASPECT_DIMS[aspect];
      expect(html).toContain(`data-aspect="${aspect}"`);
      expect(html).toContain(`data-width="${dims.w}"`);
      expect(html).toContain(`data-height="${dims.h}"`);
      expect(html).toContain(`--stage-w:${dims.w}px`);
      expect(html).toContain(`--stage-h:${dims.h}px`);
      expect(html).toContain(`--scale:${dims.scale}`);
    });
  });

  it("falls back to 9:16 on unknown aspect", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      aspect: "99:99",
    });
    expect(html).toContain('data-aspect="9:16"');
    expect(html).toContain('data-width="1080"');
  });

  describe.each(["alice", "minh", "linh", "huy", "mai", "neutral"])("character=%s", (id) => {
    it(`injects host-overlay block with avatars/${id}.svg`, () => {
      const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
      const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
      const html = composeHtml({
        script,
        sceneAudio,
        gapSec: 0.3,
        bgImageRelPath: "images/bg.jpg",
        audioRelPath: "voice.mp3",
        character: id,
      });
      expect(html).toContain(`data-character="${id}"`);
      expect(html).toContain('class="host-overlay"');
      expect(html).toContain(`avatars/${id}.svg`);
      expect(html).toContain(`avatars/${id}-mouth.svg`);
    });
  });

  it("skips host overlay when character is unknown (falls back to none)", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      character: "../../etc/passwd",
    });
    expect(html).toContain('data-character="none"');
    expect(html).not.toContain('class="host-overlay"');
  });

  it("custom character with sanitized asset path", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      character: "custom",
      customCharacterAsset: "avatars/user-uploaded.png",
    });
    expect(html).toContain('data-character="custom"');
    expect(html).toContain('avatars/user-uploaded.png');
  });

  it("b-roll <video> emits at stage level, not nested inside scene div", () => {
    // Regression: HyperFrames refuses to play <video data-start> nested
    // inside <div class="scene clip" data-start>. The framework throws
    // "video_nested_in_timed_element" lint and the worker times out at
    // FrameCapture with "video metadata not ready after 45000ms". Verify
    // the broll tag lives OUTSIDE the scene wrapper.
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      sceneBroll: { hook: "broll/scene-hook.mp4" },
    });
    // Find both substrings + their positions.
    const videoIdx = html.indexOf('id="broll-hook"');
    const sceneOpenIdx = html.indexOf('id="scene-hook"');
    expect(videoIdx).toBeGreaterThan(0);
    expect(sceneOpenIdx).toBeGreaterThan(0);
    // Video tag must appear BEFORE the scene wrapper in the rendered HTML.
    expect(videoIdx).toBeLessThan(sceneOpenIdx);
    // The scene div MUST NOT contain the broll video. Slice from scene open
    // to scene close and confirm no `<video` is inside.
    const sceneCloseIdx = html.indexOf("</div>", sceneOpenIdx);
    const sceneSlice = html.slice(sceneOpenIdx, sceneCloseIdx + 6);
    expect(sceneSlice).not.toContain("<video");
    // Video must carry the `clip` class so HyperFrames time-gates it.
    expect(html).toContain('class="bg bg-broll clip"');
  });

  it("custom character rejects path-traversal", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      character: "custom",
      customCharacterAsset: "../../../etc/passwd",
    });
    // Path traversal rejected → falls back to neutral
    expect(html).toContain('avatars/neutral.svg');
    expect(html).not.toContain('etc/passwd');
  });
});
