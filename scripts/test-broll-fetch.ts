/**
 * Smoke test for the full b-roll pipeline (Gemini keywords → Pexels search
 * → download → cache). Spends ~1 Pexels request per scene.
 *
 * Reads PEXELS_API_KEY + GEMINI_API_KEY from .env.local (or process.env
 * if exported). Writes the downloaded mp4s into ./output/_broll-test/.
 *
 * Run:  PEXELS_API_KEY=xxx tsx scripts/test-broll-fetch.ts
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { ScriptSchema } from "../src/render/script-schema.js";
import { extractBrollKeywords } from "../src/assets/broll-keywords.js";
import { fetchBroll } from "../src/assets/broll-fetcher.js";

async function main() {
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) {
    console.error("PEXELS_API_KEY missing — pass as env var.");
    process.exit(1);
  }

  const fixture = readFileSync("./tests/fixtures/sample-script-with-image.json", "utf8");
  const raw = JSON.parse(fixture);
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}") {
    raw.voice.voiceId = process.env.VIETNAMESE_VOICEID || "stubvoiceidstubvoice12345";
  }
  const script = ScriptSchema.parse(raw);

  console.log(`Step 1: Translate ${script.scenes.length} scenes (Gemini)...`);
  const t0 = Date.now();
  const keywords = await extractBrollKeywords(script, process.env.GEMINI_API_KEY);
  console.log(`  done in ${Date.now() - t0}ms`);

  console.log(`\nStep 2: Fetch b-roll per scene (Pexels portrait, max 30s)...`);
  const outDir = "./output/_broll-test/broll";
  mkdirSync(outDir, { recursive: true });

  let okCount = 0;
  let failCount = 0;
  for (const scene of script.scenes) {
    const q = keywords.get(scene.id) ?? "";
    if (!q) continue;
    const outAbs = join(outDir, `scene-${scene.id}.mp4`);
    const t = Date.now();
    const got = await fetchBroll(pexelsKey, q, outAbs, {
      targetDurationSec: 6,
      maxClipDurationSec: 30,
      preferHd: true,
    });
    const dt = Date.now() - t;
    if (got) {
      const size = statSync(got.absPath).size;
      console.log(`  ✓ ${scene.id.padEnd(10)} | "${q.padEnd(28)}" | ${(size / 1e6).toFixed(1).padStart(5)}MB | ${dt}ms`);
      okCount += 1;
    } else {
      console.log(`  ✗ ${scene.id.padEnd(10)} | "${q.padEnd(28)}" | no match  | ${dt}ms`);
      failCount += 1;
    }
  }

  console.log(`\n── Summary ──`);
  console.log(`  ${okCount}/${script.scenes.length} scenes covered, ${failCount} misses`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
