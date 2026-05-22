/**
 * Vietnamese voiceText → English visual keywords for Pexels b-roll search.
 *
 * Pexels API accepts English queries only — Vietnamese yields empty/poor
 * results. We batch-translate every scene's voiceText through Gemini in a
 * single call (cheap: ~$0.0005 total per 10-scene render). If Gemini key
 * is missing or the call fails, fall back to template-based keywords so the
 * pipeline still produces *some* relevant b-roll.
 *
 * Returned keywords are space-joined and used as the Pexels `query` param.
 * Each scene gets up to 3 keywords (Pexels matches better with shorter).
 */

import { log } from "../utils/logger.js";
import type { Script } from "../render/script-schema.js";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
const GEMINI_TIMEOUT_MS = 20_000;

/** Cheap fallback per scene type when Gemini is unavailable. */
const TEMPLATE_FALLBACK_KEYWORDS: Record<string, string> = {
  hook: "news headline broadcast",
  comparison: "split screen versus abstract",
  "stat-hero": "data analytics chart",
  "feature-list": "modern technology screen",
  callout: "abstract bokeh background",
  outro: "sunset cityscape skyline",
};

export interface SceneKeywords {
  sceneId: string;
  /** Space-joined keyword phrase suitable as Pexels query param. */
  query: string;
}

/**
 * Translate all scenes' voiceText → English visual keywords in ONE batch.
 *
 * Returns a Map<sceneId, query>. If Gemini fails or key missing, returns
 * a fallback Map populated from `TEMPLATE_FALLBACK_KEYWORDS`.
 *
 * Idempotent and stateless — caller decides whether to cache the result.
 */
export async function extractBrollKeywords(
  script: Script,
  geminiApiKey: string | undefined,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Always populate fallback first so unknown templates still get *something*
  for (const scene of script.scenes) {
    const tpl = scene.templateData.template;
    out.set(scene.id, TEMPLATE_FALLBACK_KEYWORDS[tpl] ?? "abstract motion graphics");
  }

  if (!geminiApiKey || geminiApiKey.trim() === "") {
    log.warn("[broll-keywords] GEMINI_API_KEY missing — using template fallback keywords");
    return out;
  }

  // Build a single batch prompt: ask Gemini to translate each scene's
  // voiceText into 2-3 English visual keywords. Output strict JSON.
  const scenesPayload = script.scenes.map((s) => ({
    id: s.id,
    template: s.templateData.template,
    text: s.voiceText.slice(0, 200), // truncate — only need topic
  }));

  const prompt = `You are a stock-footage curator. For each Vietnamese scene below, output 2-3 short ENGLISH keywords that describe what STOCK VIDEO FOOTAGE would visually fit the scene (NOT a literal translation).

Rules:
- Output VALID JSON ONLY, no markdown fence.
- Keywords must be searchable on Pexels (concrete nouns/visuals, not abstract ideas).
- Prefer cinematic/B-roll terms: "city skyline", "ocean waves", "data analytics", "people walking", "neon lights", "coffee cup", "laptop typing".
- 2-3 words per scene total (space-joined).
- Match the scene template's typical visual: hook=dramatic news, comparison=split focus, stat-hero=charts/data, feature-list=tech/product, callout=clean abstract, outro=cityscape/sunset.

Input scenes:
${JSON.stringify(scenesPayload, null, 2)}

Output schema:
{"keywords":[{"id":"scene_id","query":"english keywords"}]}`;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const resp = await fetch(GEMINI_URL(GEMINI_MODEL, geminiApiKey), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!resp.ok) {
      log.warn(`[broll-keywords] Gemini HTTP ${resp.status} — using fallback keywords`);
      return out;
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!rawText) {
      log.warn("[broll-keywords] Gemini returned empty content — using fallback keywords");
      return out;
    }

    const parsed = JSON.parse(rawText) as {
      keywords?: Array<{ id?: string; query?: string }>;
    };
    if (!Array.isArray(parsed.keywords)) {
      log.warn("[broll-keywords] Gemini response missing .keywords[] — using fallback");
      return out;
    }

    for (const k of parsed.keywords) {
      if (!k?.id || typeof k.query !== "string") continue;
      const q = k.query.trim().toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ");
      if (q.length >= 3) out.set(k.id, q);
    }
    log.info(`[broll-keywords] Gemini translated ${parsed.keywords.length}/${script.scenes.length} scenes`);
    return out;
  } catch (e: any) {
    log.warn(`[broll-keywords] Gemini call failed (${e?.message ?? e}) — using fallback keywords`);
    return out;
  }
}
