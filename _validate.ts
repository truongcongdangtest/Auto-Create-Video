// Throwaway: validate a job script against the real Zod schema (no TTS/render).
import { readFileSync } from "node:fs";
import { ScriptSchema } from "./src/render/script-schema.js";

const path = process.argv[2] ?? "jobs/proxy-la-gi/script.json";
const raw = JSON.parse(readFileSync(path, "utf8"));
const r = ScriptSchema.safeParse(raw);
if (!r.success) {
  console.error("INVALID:", path);
  console.error(JSON.stringify(r.error.format(), null, 2));
  process.exit(1);
}
const s = r.data;
console.log("VALID:", path, "| scenes:", s.scenes.length);
// rough duration estimate: VN TTS ~ 2.9 words/sec @0.95 speed + 0.3s gaps
let words = 0;
for (const sc of s.scenes) words += sc.voiceText.trim().split(/\s+/).length;
const speech = words / 2.9;
const gaps = (s.scenes.length - 1) * 0.3;
console.log(`words=${words}  est.speech=${speech.toFixed(1)}s  +gaps=${(speech + gaps).toFixed(1)}s`);
