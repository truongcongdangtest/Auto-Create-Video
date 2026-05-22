import { describe, expect, it } from "vitest";
import { composeHtml } from "../src/render/html-composer.js";
import type { Script } from "../src/render/script-schema.js";

const baseScript: Script = {
  version: "1.0",
  metadata: {
    title: "Test",
    source: { url: "https://x.com", domain: "x.com", image: null },
    channel: "Test Channel",
  },
  voice: { provider: "lucylab", voiceId: "abc123", speed: 1.0 },
  scenes: [
    {
      id: "hook",
      type: "hook",
      voiceText: "Hook line",
      templateData: { template: "hook", headline: "Headline", subhead: "Sub", kenBurns: "zoom-in" },
    },
    {
      id: "body-1",
      type: "body",
      voiceText: "Body line",
      templateData: { template: "callout", statement: "Body statement here", tag: "TAG" },
    },
    {
      id: "outro",
      type: "outro",
      voiceText: "Outro",
      templateData: { template: "outro", ctaTop: "Follow", channelName: "Test", source: "x.com" },
    },
  ],
};

const baseAudio = [
  { id: "hook", durationSec: 4.0 },
  { id: "body-1", durationSec: 6.0 },
  { id: "outro", durationSec: 3.0 },
];

describe("composeHtml with sceneBroll", () => {
  it("emits no <video> tag when sceneBroll is absent", () => {
    const html = composeHtml({
      script: baseScript,
      sceneAudio: baseAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
    });
    expect(html).not.toContain("bg-broll");
    expect(html).not.toContain("<video class=\"bg bg-broll");
  });

  it("emits <video> with data-start + data-duration + loop for covered scenes", () => {
    const html = composeHtml({
      script: baseScript,
      sceneAudio: baseAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      sceneBroll: {
        hook: "broll/scene-hook.mp4",
        "body-1": "broll/scene-body-1.mp4",
        outro: null,
      },
    });

    // Hook scene b-roll
    expect(html).toContain('src="broll/scene-hook.mp4"');
    // Body-1 b-roll
    expect(html).toContain('src="broll/scene-body-1.mp4"');
    // Outro had null → no b-roll
    expect(html).not.toContain('src="broll/scene-outro.mp4"');

    // Critical HyperFrames attrs
    expect(html).toMatch(/data-start="\d+\.\d{2}".*data-duration="\d+\.\d{2}"/);
    expect(html).toContain("loop muted");
    expect(html).toContain("bg-overlay");
  });

  it("uses scene timing in data-start (hook starts at 0, body-1 starts after hook+gap)", () => {
    const html = composeHtml({
      script: baseScript,
      sceneAudio: baseAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      sceneBroll: { hook: "broll/scene-hook.mp4", "body-1": "broll/scene-body-1.mp4", outro: null },
    });

    // Hook starts at t=0
    expect(html).toMatch(/<video[^>]*data-start="0\.00"[^>]*src="broll\/scene-hook\.mp4"/);
    // Body-1 should start at 4.0 + 0.3 = 4.30
    expect(html).toMatch(/<video[^>]*data-start="4\.30"[^>]*src="broll\/scene-body-1\.mp4"/);
  });

  it("escapes broll path to prevent XSS via crafted filename", () => {
    const html = composeHtml({
      script: baseScript,
      sceneAudio: baseAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      sceneBroll: { hook: 'broll/" onerror="alert(1)" x="', "body-1": null, outro: null },
    });
    expect(html).not.toContain('" onerror="');
    expect(html).toContain("&quot;");
  });

  it("hook scene skips legacy .overlay element when b-roll is present", () => {
    const html = composeHtml({
      script: baseScript,
      sceneAudio: baseAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      sceneBroll: { hook: "broll/scene-hook.mp4", "body-1": null, outro: null },
    });
    // Find hook scene block
    const hookMatch = html.match(/<div class="scene clip" id="scene-hook"[^>]*>([\s\S]*?)<\/div>\s*<div class="scene clip" id="scene-body-1"/);
    expect(hookMatch).toBeTruthy();
    const hookInner = hookMatch![1];
    // Legacy gradient/image divs should NOT be in hook when b-roll wins
    expect(hookInner).not.toContain("gradient-news-dark");
    expect(hookInner).not.toContain("kb-zoom-in");
    expect(hookInner).not.toContain('class="overlay"');
    // But b-roll <video> + .bg-overlay should be there
    expect(hookInner).toContain("bg-broll");
    expect(hookInner).toContain("bg-overlay");
  });
});
