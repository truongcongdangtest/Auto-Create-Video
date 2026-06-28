/**
 * Vietnamese voiceText → English IMAGE-GENERATION prompts (for AI still images).
 *
 * Unlike `broll-keywords.ts` (2-3 keywords for Pexels search), this asks Gemini
 * for a full, vivid English prompt per scene that visually represents WHAT THE
 * NARRATION IS SAYING — so the generated picture matches the spoken words
 * ("nói đến đâu hiện hình đến đó"). One batch call (~$0.0005). Falls back to a
 * template-based prompt when GEMINI_API_KEY is missing or the call fails, so the
 * pipeline always gets *some* relevant image prompt.
 *
 * The returned prompt is the SUBJECT only; the fetcher appends a consistent
 * visual style suffix so all scenes look cohesive with the brand theme.
 */

import { log } from "../utils/logger.js";
import type { Script } from "../render/script-schema.js";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
const GEMINI_TIMEOUT_MS = 25_000;

/** Cheap fallback subject per scene type when Gemini is unavailable. */
const TEMPLATE_FALLBACK_PROMPTS: Record<string, string> = {
  hook: "a dramatic close-up that grabs attention, tense mood",
  comparison: "two contrasting objects side by side, clear visual difference",
  "stat-hero": "a glowing data dashboard with charts and numbers",
  "feature-list": "a sleek modern device screen showing an app interface",
  callout: "a clean minimal conceptual still life on a dark surface",
  outro: "a calm cinematic city skyline at dusk",
};

export interface ScenePrompt {
  sceneId: string;
  /** English image subject (style suffix appended later by the fetcher). */
  prompt: string;
}

/**
 * Translate all scenes' voiceText → English image prompts in ONE batch.
 * Returns a Map<sceneId, prompt>. Always populated (fallback first).
 */
export async function extractImagePrompts(
  script: Script,
  geminiApiKey: string | undefined,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Always populate fallback first so unknown templates still get *something*.
  for (const scene of script.scenes) {
    const tpl = scene.templateData.template;
    out.set(scene.id, TEMPLATE_FALLBACK_PROMPTS[tpl] ?? "an abstract conceptual background");
  }

  if (!geminiApiKey || geminiApiKey.trim() === "") {
    log.warn("[image-prompts] GEMINI_API_KEY missing — using template fallback prompts");
    return out;
  }

  const scenesPayload = script.scenes.map((s) => ({
    id: s.id,
    template: s.templateData.template,
    text: s.voiceText.slice(0, 240),
  }));

  const prompt = `You write prompts for an AI image generator. For each Vietnamese scene below, write ONE concise ENGLISH image prompt describing a single concrete, photographable SCENE that visually represents WHAT THE NARRATION SAYS (so the picture matches the spoken meaning — not a literal word translation).

Rules:
- Output VALID JSON ONLY, no markdown fence.
- Describe ONE clear subject/scene: people, objects, places, devices, actions. Concrete and visual.
- 8-18 words. No on-image text, no letters, no logos, no charts-with-words.
- Keep it brand-safe and realistic (a photo, not a meme).
- Do NOT include style words (lighting/quality/aspect) — only the subject. Style is added later.

Input scenes:
${JSON.stringify(scenesPayload, null, 2)}

Output schema:
{"prompts":[{"id":"scene_id","prompt":"english image subject"}]}`;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const resp = await fetch(GEMINI_URL(GEMINI_MODEL, geminiApiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!resp.ok) {
      log.warn(`[image-prompts] Gemini HTTP ${resp.status} — using fallback prompts`);
      return out;
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText) {
      log.warn("[image-prompts] Gemini returned empty content — using fallback prompts");
      return out;
    }

    const parsed = JSON.parse(rawText) as {
      prompts?: Array<{ id?: string; prompt?: string }>;
    };
    if (!Array.isArray(parsed.prompts)) {
      log.warn("[image-prompts] Gemini response missing .prompts[] — using fallback");
      return out;
    }

    for (const p of parsed.prompts) {
      if (!p?.id || typeof p.prompt !== "string") continue;
      // Keep letters/spaces/basic punctuation; strip anything weird that could
      // break the URL-encoded Pollinations path or inject style noise.
      const clean = p.prompt.trim().replace(/[\r\n]+/g, " ").replace(/[^\p{L}\p{N} ,.\-]/gu, " ").replace(/\s+/g, " ");
      if (clean.length >= 6) out.set(p.id, clean);
    }
    log.info(`[image-prompts] Gemini wrote ${parsed.prompts.length}/${script.scenes.length} scene prompts`);
    return out;
  } catch (e: any) {
    log.warn(`[image-prompts] Gemini call failed (${e?.message ?? e}) — using fallback prompts`);
    return out;
  }
}
