/**
 * Pexels Videos b-roll fetcher with content-addressed cross-project cache.
 *
 * For each (sceneId, query) the pipeline:
 *   1. Hashes (query|orientation|maxDur) to a 16-hex key.
 *   2. Checks `<CACHE_DIR>/{hash}.mp4` — if present, copy into project.
 *   3. Else searches Pexels `videos/search?orientation=portrait`, picks the
 *      best 9:16 video_files entry, downloads to cache, then copies in.
 *
 * Graceful degradation:
 *   - No PEXELS_API_KEY → skip silently, log warning. Pipeline continues
 *     with the existing static-image bg.
 *   - Empty search results → return null for that scene (composer falls back).
 *   - HTTP 429 (rate limit) → log + return null (caller decides whether to
 *     bail or continue with partial coverage).
 *
 * Pexels free tier: 200 requests/hour, 20,000/month. With caching, a
 * 10-scene render hits ~10 searches (cold) → well under the limit.
 */

import { existsSync, mkdirSync } from "node:fs";
import { writeFile, copyFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { log } from "../utils/logger.js";

const PEXELS_ENDPOINT = "https://api.pexels.com/videos/search";
const PEXELS_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
// Hard cap per clip. Chromium decodes ALL <video> elements simultaneously
// during HyperFrames frame capture — 7 scenes × 30MB each tanks render
// speed by 2-3x even on fast machines. The dark .bg-overlay hides most
// SD/HD detail loss, so 15MB is the sweet spot for 5-10s portrait clips.
const MAX_FILE_BYTES = 15 * 1024 * 1024;

export interface BrollOptions {
  /** Target video duration in seconds (used to pick a clip ≥ this, plus margin). */
  targetDurationSec: number;
  /** Hard cap on Pexels `max_duration` param to keep clips short. */
  maxClipDurationSec?: number;
  /** Prefer 1080×1920+ when available; else accept 720p portrait. */
  preferHd?: boolean;
}

interface PexelsVideoFile {
  link: string;
  quality: string;
  width: number;
  height: number;
  file_type: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string;
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[];
  total_results?: number;
}

/** Resolve the cross-project cache dir. Created lazily on first write. */
function brollCacheDir(): string {
  const base = process.env.VIETVIRAL_CACHE_DIR ?? join(homedir(), ".cache", "vietviral");
  return join(base, "broll");
}

function cacheKey(query: string, opts: BrollOptions): string {
  const norm = query.trim().toLowerCase().replace(/\s+/g, " ");
  const h = createHash("sha256");
  h.update(norm);
  h.update("|");
  h.update(`maxDur=${opts.maxClipDurationSec ?? 30}`);
  h.update("|");
  h.update(`preferHd=${opts.preferHd ?? true}`);
  return h.digest("hex").slice(0, 16);
}

/**
 * Pick the best 9:16 video_files entry. Strategy reversed from "prefer HD"
 * to "prefer SD" — HD 1080×1920 portrait clips often come back at 30-50MB
 * for 8-15s, which tanks HyperFrames render time because Chromium has to
 * decode every scene's <video> simultaneously per frame. SD 720×1280 looks
 * identical under the dark `.bg-overlay` we apply, at ~5-12MB per clip.
 *
 * Falls back to HD only when no SD candidate exists.
 */
function pickBestFile(video: PexelsVideo, preferHd: boolean): PexelsVideoFile | null {
  const mp4s = video.video_files.filter((f) => f.file_type === "video/mp4");
  if (mp4s.length === 0) return null;

  // 1. Portrait SD ~720×1280 — smallest file that still looks good
  //    under the .bg-overlay dark gradient.
  const portraitSd = mp4s.filter(
    (f) => f.height > f.width && f.width >= 540 && f.width <= 720,
  );
  if (portraitSd.length > 0) {
    // Bigger width inside the band = sharper without bloat
    return portraitSd.sort((a, b) => b.width - a.width)[0];
  }

  if (preferHd) {
    // 2. Portrait HD as fallback — but only if no SD candidate.
    const portraitHd = mp4s.filter(
      (f) => f.height > f.width && f.width >= 1080,
    );
    if (portraitHd.length > 0) {
      return portraitHd.sort((a, b) => a.width - b.width)[0]; // smallest HD
    }
  }

  // 3. Any portrait file (cover edge cases like 540×960)
  const anyPortrait = mp4s.filter((f) => f.height > f.width);
  if (anyPortrait.length > 0) return anyPortrait[0];

  return null;
}

/**
 * Search Pexels for ONE video matching the query. Returns the chosen
 * video + best file, or null if nothing usable was found.
 */
async function searchOne(
  apiKey: string,
  query: string,
  opts: BrollOptions,
): Promise<{ video: PexelsVideo; file: PexelsVideoFile } | null> {
  // Shorter clips loop fine + are *much* smaller. 15s cap kills the 30s
  // monsters that ballooned past-100MB total for a 7-scene video.
  const maxDur = opts.maxClipDurationSec ?? 15;
  const url = new URL(PEXELS_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "portrait");
  url.searchParams.set("per_page", "10");
  url.searchParams.set("max_duration", String(Math.max(8, maxDur)));
  // Pexels also honours `size=small|medium|large` — small is roughly 720p,
  // medium 1080p, large 4k. We want small/medium since we filter further
  // by width in pickBestFile.
  url.searchParams.set("size", "medium");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PEXELS_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: apiKey, "User-Agent": "VietViral/0.5" },
      signal: controller.signal,
    });
    if (resp.status === 429) {
      log.warn(`[broll-fetcher] Pexels rate limit (429) — caching cooldown not implemented; this query skipped`);
      return null;
    }
    if (!resp.ok) {
      log.warn(`[broll-fetcher] Pexels HTTP ${resp.status} for query="${query}"`);
      return null;
    }
    const data = (await resp.json()) as PexelsSearchResponse;
    if (!Array.isArray(data.videos) || data.videos.length === 0) {
      return null;
    }
    for (const v of data.videos) {
      const file = pickBestFile(v, opts.preferHd ?? true);
      if (file) return { video: v, file };
    }
    return null;
  } catch (e: any) {
    log.warn(`[broll-fetcher] Pexels search error for "${query}": ${e?.message ?? e}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Download a single video file to `outPath`. Returns true on success. */
async function downloadVideo(url: string, outPath: string): Promise<boolean> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      log.warn(`[broll-fetcher] download HTTP ${resp.status} for ${url}`);
      return false;
    }
    const len = Number(resp.headers.get("content-length") ?? "0");
    if (len > MAX_FILE_BYTES) {
      log.warn(`[broll-fetcher] file too large (${(len / 1e6).toFixed(1)}MB > ${MAX_FILE_BYTES / 1e6}MB), skip`);
      return false;
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) {
      log.warn(`[broll-fetcher] body too large (${(buf.length / 1e6).toFixed(1)}MB), discard`);
      return false;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    return true;
  } catch (e: any) {
    log.warn(`[broll-fetcher] download error: ${e?.message ?? e}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch (or read from cache) ONE b-roll clip for a given query.
 * Copies the cached/fetched clip into `projectRelOutPath` (absolute) and
 * returns the basename for embedding in HTML (e.g. "broll/scene-hook.mp4").
 *
 * Returns null on any failure — caller treats as "no b-roll, use fallback bg".
 */
export async function fetchBroll(
  apiKey: string,
  query: string,
  projectAbsOutPath: string,
  opts: BrollOptions,
): Promise<{ relPath: string; absPath: string } | null> {
  if (!query || query.trim().length < 3) return null;

  const key = cacheKey(query, opts);
  const cacheDir = brollCacheDir();
  const cachePath = join(cacheDir, `${key}.mp4`);

  // Cache hit
  if (existsSync(cachePath)) {
    try {
      const s = await stat(cachePath);
      if (s.size > 1024) {
        mkdirSync(dirname(projectAbsOutPath), { recursive: true });
        await copyFile(cachePath, projectAbsOutPath);
        log.info(`  broll cache HIT "${query}" → ${cachePath} (${(s.size / 1e6).toFixed(1)}MB)`);
        return { relPath: relFromOutDir(projectAbsOutPath), absPath: projectAbsOutPath };
      }
    } catch {
      // fall through to refetch
    }
  }

  const found = await searchOne(apiKey, query, opts);
  if (!found) {
    log.info(`  broll MISS "${query}" — no portrait video found on Pexels`);
    return null;
  }

  // Download to cache, then copy into project
  const ok = await downloadVideo(found.file.link, cachePath);
  if (!ok) return null;

  try {
    mkdirSync(dirname(projectAbsOutPath), { recursive: true });
    await copyFile(cachePath, projectAbsOutPath);
  } catch (e: any) {
    log.warn(`[broll-fetcher] copy to project failed: ${e?.message ?? e}`);
    return null;
  }
  log.info(
    `  broll FETCH "${query}" → id=${found.video.id} ${found.file.width}x${found.file.height} (${found.file.quality}, ${found.video.duration}s)`,
  );
  return { relPath: relFromOutDir(projectAbsOutPath), absPath: projectAbsOutPath };
}

/** Compute a relative path string for use in HTML src=. Assumes the file is
 * inside the project's `broll/` subdir; returns "broll/<basename>". */
function relFromOutDir(absPath: string): string {
  const parts = absPath.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1];
  return `broll/${last}`;
}
