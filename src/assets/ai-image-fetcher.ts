/**
 * AI still-image generator via Pollinations.ai (free, no API key, no card).
 *
 * For each scene the pipeline passes an English subject prompt; we append a
 * consistent cinematic style suffix (so every scene looks cohesive with the
 * cloak-orange dark theme) and request a vertical 1080×1920 image. The result
 * is a STILL JPEG — it decodes once at page load, so hyperframes renders it
 * cheaply (no per-frame video decode like the Pexels b-roll path). This is the
 * "light, free-on-GitHub" matched-visual path.
 *
 * Content-addressed cache in `<CACHE_DIR>/{hash}.jpg`: same prompt+size reuses
 * the file across renders, so re-runs cost zero generation time.
 *
 * Graceful degradation: any failure (timeout, non-image, too-small, network)
 * returns false for that scene and the composer falls back to the gradient bg.
 */

import axios from "axios";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile, copyFile, stat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { log } from "../utils/logger.js";

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt/";
const REQUEST_TIMEOUT_MS = 90_000;
const MIN_IMAGE_BYTES = 4_000; // smaller than this = an error placeholder, reject
const MODEL = "flux";

// Consistent visual style appended to every subject so scenes look cohesive
// with the brand (dark, cinematic, subtle orange accent) and never bake text.
const STYLE_SUFFIX =
  "cinematic photograph, vertical 9:16 composition, dramatic moody lighting, " +
  "dark background, subtle warm orange accent, shallow depth of field, " +
  "photorealistic, high detail, no text, no words, no watermark, no logo";

const CACHE_DIR = join(homedir(), ".cache", "vietviral", "aiimg");

function ensureCacheDir(): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    /* ignore — falls back to direct write */
  }
}

function cacheKey(styled: string, width: number, height: number, seed: number): string {
  return createHash("sha256").update(`${styled}|${width}x${height}|${seed}|${MODEL}`).digest("hex").slice(0, 16);
}

function buildUrl(styled: string, width: number, height: number, seed: number): string {
  const path = encodeURIComponent(styled);
  const q = `?width=${width}&height=${height}&seed=${seed}&model=${MODEL}&nologo=true`;
  return `${POLLINATIONS_BASE}${path}${q}`;
}

async function isUsableImage(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.size >= MIN_IMAGE_BYTES;
  } catch {
    return false;
  }
}

export interface FetchAiImageOpts {
  width?: number;
  height?: number;
  /** Deterministic seed so the same scene reproduces the same image. */
  seed?: number;
}

/**
 * Generate (or reuse from cache) one AI image for a scene and write it to
 * `outAbsPath`. Returns true on success, false on any failure (caller falls
 * back to the gradient bg for that scene).
 */
export async function fetchAiImage(
  subject: string,
  outAbsPath: string,
  opts: FetchAiImageOpts = {},
): Promise<boolean> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1920;
  const seed = opts.seed ?? 1;
  const styled = `${subject.trim().replace(/[.\s]+$/, "")}. ${STYLE_SUFFIX}`;

  ensureCacheDir();
  const key = cacheKey(styled, width, height, seed);
  const cachePath = join(CACHE_DIR, `${key}.jpg`);

  await mkdir(dirname(outAbsPath), { recursive: true });

  // Cache hit — reuse.
  if (await isUsableImage(cachePath)) {
    try {
      await copyFile(cachePath, outAbsPath);
      log.info(`[ai-image] cache hit ${key} → ${outAbsPath}`);
      return true;
    } catch {
      /* fall through to refetch */
    }
  }

  const url = buildUrl(styled, width, height, seed);

  // Pollinations' free/anonymous tier rate-limits hard (HTTP 429) when requests
  // arrive close together. Callers MUST fetch sequentially; here we additionally
  // back off on failure — longer cool-off for 429 (rate limit), shorter for
  // transient 5xx/timeouts — so a full set of scenes completes despite the cap.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let waitMs = 0;
    try {
      const resp = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: (s) => s < 400,
        headers: { "User-Agent": "Mozilla/5.0 (ACV/1.0)" },
      });
      const ct = String(resp.headers["content-type"] ?? "");
      const buf = Buffer.from(resp.data);
      if (!ct.startsWith("image/")) {
        log.warn(`[ai-image] attempt ${attempt}: non-image content-type "${ct}"`);
        waitMs = 4_000 * attempt;
      } else if (buf.byteLength < MIN_IMAGE_BYTES) {
        log.warn(`[ai-image] attempt ${attempt}: image too small (${buf.byteLength}B)`);
        waitMs = 4_000 * attempt;
      } else {
        // Save to cache (best-effort) + the output path.
        try {
          await writeFile(cachePath, buf);
        } catch {
          /* cache write optional */
        }
        await writeFile(outAbsPath, buf);
        log.info(`[ai-image] generated ${buf.byteLength}B → ${outAbsPath}`);
        return true;
      }
    } catch (e: any) {
      const status = e?.response?.status;
      log.warn(`[ai-image] attempt ${attempt} failed: ${status ? `http ${status}` : String(e?.message ?? e)}`);
      // 429 = rate limited → wait much longer; other errors → modest backoff.
      waitMs = status === 429 ? 10_000 * attempt : 3_000 * attempt;
    }
    if (attempt < MAX_ATTEMPTS && waitMs > 0) {
      await sleep(waitMs);
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
