/**
 * Quick smoke test for extractBrollKeywords using real Gemini API.
 * Run: tsx scripts/test-broll-keywords.ts
 *
 * Reads GEMINI_API_KEY from .env.local. Prints translated keywords for
 * the sample fixture so we can eyeball quality before wiring into the
 * full pipeline.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { ScriptSchema } from "../src/render/script-schema.js";
import { extractBrollKeywords } from "../src/assets/broll-keywords.js";

async function main() {
  const fixture = readFileSync("./tests/fixtures/sample-script-with-image.json", "utf8");
  const raw = JSON.parse(fixture);
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}") {
    raw.voice.voiceId = process.env.VIETNAMESE_VOICEID || "stubvoiceidstubvoice12345";
  }
  const script = ScriptSchema.parse(raw);

  console.log(`Translating ${script.scenes.length} scenes via Gemini...`);
  const t0 = Date.now();
  const keywords = await extractBrollKeywords(script, process.env.GEMINI_API_KEY);
  const dt = Date.now() - t0;

  console.log(`\n── Result (${dt}ms) ──`);
  for (const scene of script.scenes) {
    const kw = keywords.get(scene.id);
    console.log(`  ${scene.id.padEnd(10)} | ${(scene.templateData as any).template.padEnd(14)} | "${kw}"`);
    console.log(`             | voice: "${scene.voiceText.slice(0, 70)}..."`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
