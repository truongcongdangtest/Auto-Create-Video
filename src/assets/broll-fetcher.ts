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

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { writeFile, copyFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { log } from "../utils/logger.js";

/**
 * Quick ffprobe sanity check — verifies the file contains a decodable video
 * stream with a non-zero duration. Catches Pexels downloads that were
 * truncated mid-stream (moov atom missing, NAL unit corruption, etc.) and
 * the resulting cached file would otherwise be re-used forever, failing
 * every subsequent render with the same opaque "ffprobe exit 1" inside
 * hyperframes. ~50-100ms cost per call, fine for the once-per-clip
 * download/re-encode pipeline.
 */
function isValidVideoFile(path: string): boolean {
  if (!existsSync(path)) return false;
  const r = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name",
      "-show_entries", "format=duration",
      "-of", "default=nokey=1:noprint_wrappers=1",
      path,
    ],
    { timeout: 5000, encoding: "utf8", windowsHide: true },
  );
  if (r.status !== 0) return false;
  const lines = (r.stdout ?? "").trim().split(/\s+/);
  if (lines.length < 2) return false;
  const codec = lines[0];
  const dur = parseFloat(lines[1]);
  // Empty / placeholder / silent-stream files fail one of these guards.
  return codec.length > 0 && codec !== "N/A" && Number.isFinite(dur) && dur > 0.1;
}

/** Best-effort delete; never throws. */
function safeUnlink(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* ignore */
  }
}

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

/** Download a single video file to `outPath`. Returns true on success.
 *
 * Validates the resulting file with ffprobe before signalling success — a
 * truncated Pexels download (network hiccup, server timeout, content-length
 * mismatch) writes a partial MP4 with no `moov` atom that LOOKS fine to
 * `existsSync` and `stat.size > 1024` but causes hyperframes' Chromium
 * ffprobe to fail later inside the render pipeline with an opaque exit 1.
 * Failing fast here lets the caller retry instead of poisoning the cache
 * forever. */
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
    // Validate the just-written file before reporting success — see fn docstring.
    if (!isValidVideoFile(outPath)) {
      log.warn(`[broll-fetcher] downloaded file failed ffprobe validation: ${outPath}`);
      safeUnlink(outPath);
      return false;
    }
    return true;
  } catch (e: any) {
    log.warn(`[broll-fetcher] download error: ${e?.message ?? e}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Re-encode a Pexels clip with dense keyframes (every 30 frames = 1s @ 30fps)
 * so HyperFrames' Chromium can seek frame-by-frame cheaply. Without this the
 * raw Pexels file has keyframes every ~3-5s; during Phase 7a rasterize each
 * frame seek forces Chromium to re-decode from the previous keyframe (~90
 * frames back on average), pinning CPU at 100% and pushing total render
 * times to 20+ minutes for a 60s clip. With dense keyframes seek cost drops
 * ~10x.
 *
 * Uses NVIDIA NVENC (`h264_nvenc`) when available — VietViral's sidecar
 * engine probes the encoder at startup and exports `VIETVIRAL_USE_GPU=1`
 * on success. Falls back to CPU `libx264 -preset veryfast` otherwise.
 * Strips audio (Pexels b-roll plays muted anyway) to shave 5-15% bytes.
 *
 * Returns true on success, false otherwise (caller falls back to raw clip).
 */
async function reencodeForFastSeek(input: string, output: string): Promise<boolean> {
  const useGpu =
    process.env.VIETVIRAL_USE_GPU === "1" && process.env.VIETVIRAL_NO_GPU !== "1";

  const args: string[] = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", input,
    "-an",                  // drop audio (b-roll renders muted)
    "-pix_fmt", "yuv420p",  // Chromium-safe pixel format
    "-g", "30",
    "-keyint_min", "30",
    "-movflags", "+faststart",
  ];
  if (useGpu) {
    // NVENC: p5 = "slower"/quality preset; -rc vbr + bitrate target keeps
    // file size reasonable. Bitrate budget tuned for 1080p SD-source clips;
    // NVENC reaches ~12-18x realtime on a single Turing GPU (RTX 2080 class).
    args.push(
      "-c:v", "h264_nvenc",
      "-preset", "p5",
      "-tune", "hq",
      "-rc", "vbr",
      "-b:v", "3.5M",
      "-maxrate", "5M",
      "-bufsize", "7M",
    );
  } else {
    // CPU fallback. `veryfast` + crf 24 stays well within disk budget while
    // still running ~3-5x realtime on a modern desktop CPU.
    args.push(
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
    );
  }
  args.push(output);

  return new Promise<boolean>((resolve) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      log.warn(`[broll-fetcher] ffmpeg spawn error: ${err.message}`);
      resolve(false);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        log.warn(
          `[broll-fetcher] ffmpeg exit ${code} re-encoding ${basename(input)}: ${stderr.slice(0, 200).trim()}`,
        );
        safeUnlink(output);
        resolve(false);
        return;
      }
      // Re-encode reported success but the output file may still be
      // unplayable (rare ffmpeg buffer-flush issues). Validate before
      // signalling success so we never cache a broken kf30 clip.
      if (!isValidVideoFile(output)) {
        log.warn(`[broll-fetcher] re-encoded file failed ffprobe validation: ${output}`);
        safeUnlink(output);
        resolve(false);
        return;
      }
      log.info(
        `  broll re-encoded ${basename(input)} → keyframes/30f (${useGpu ? "NVENC GPU" : "CPU x264"})`,
      );
      resolve(true);
    });
  });
}

/**
 * Fetch (or read from cache) ONE b-roll clip for a given query.
 * Copies the cached/fetched clip into `projectRelOutPath` (absolute) and
 * returns the basename for embedding in HTML (e.g. "broll/scene-hook.mp4").
 *
 * Returns null on any failure — caller treats as "no b-roll, use fallback bg".
 *
 * Cache layout:
 *   `<key>.kf30.mp4` — post-fix, dense-keyframe clip (preferred)
 *   `<key>.raw.mp4`  — raw Pexels download (intermediate before re-encode)
 *   `<key>.mp4`      — legacy pre-fix cache file; auto-promoted into the
 *                       re-encode pipeline on next hit.
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
  const keyedPath = join(cacheDir, `${key}.kf30.mp4`);
  const rawPath = join(cacheDir, `${key}.raw.mp4`);
  const legacyPath = join(cacheDir, `${key}.mp4`);

  // ── Fast path: re-encoded clip already cached
  if (existsSync(keyedPath)) {
    try {
      const s = await stat(keyedPath);
      if (s.size > 1024 && isValidVideoFile(keyedPath)) {
        mkdirSync(dirname(projectAbsOutPath), { recursive: true });
        await copyFile(keyedPath, projectAbsOutPath);
        log.info(`  broll cache HIT "${query}" → ${keyedPath} (${(s.size / 1e6).toFixed(1)}MB, kf30)`);
        return { relPath: relFromOutDir(projectAbsOutPath), absPath: projectAbsOutPath };
      }
      // Cached file is corrupt — purge and fall through to re-fetch so we
      // never reuse the broken artefact forever.
      log.warn(`[broll-fetcher] cached kf30 clip is corrupt, purging: ${keyedPath}`);
      safeUnlink(keyedPath);
    } catch {
      // fall through to (re-)fetch
    }
  }

  // ── Promote a legacy raw cache file → re-encode in place, then continue.
  //   Validate the legacy file first: pre-fix downloads stored straight from
  //   the network without ffprobe verification, so some hits are corrupt.
  if (existsSync(legacyPath) && !existsSync(rawPath)) {
    if (isValidVideoFile(legacyPath)) {
      try {
        await copyFile(legacyPath, rawPath);
      } catch {
        // best-effort; if copy fails we just re-download
      }
    } else {
      log.warn(`[broll-fetcher] legacy cached clip is corrupt, purging: ${legacyPath}`);
      safeUnlink(legacyPath);
    }
  }

  // ── Validate any raw clip already on disk — purge if corrupt so the
  //   re-encode pass below doesn't inherit a broken input.
  if (existsSync(rawPath) && !isValidVideoFile(rawPath)) {
    log.warn(`[broll-fetcher] cached raw clip is corrupt, purging: ${rawPath}`);
    safeUnlink(rawPath);
  }

  // ── Download raw clip if we don't already have one
  if (!existsSync(rawPath)) {
    const found = await searchOne(apiKey, query, opts);
    if (!found) {
      log.info(`  broll MISS "${query}" — no portrait video found on Pexels`);
      return null;
    }
    const ok = await downloadVideo(found.file.link, rawPath);
    if (!ok) return null;
    log.info(
      `  broll FETCH "${query}" → id=${found.video.id} ${found.file.width}x${found.file.height} (${found.file.quality}, ${found.video.duration}s)`,
    );
  }

  // ── Re-encode to dense-keyframe variant (the slow step, but cached forever)
  const reencoded = await reencodeForFastSeek(rawPath, keyedPath);
  const sourcePath = reencoded ? keyedPath : rawPath;

  if (!reencoded) {
    log.warn(
      `[broll-fetcher] re-encode failed for "${query}" — using raw Pexels clip; Phase 7a rasterize will be slow.`,
    );
  }

  try {
    mkdirSync(dirname(projectAbsOutPath), { recursive: true });
    await copyFile(sourcePath, projectAbsOutPath);
  } catch (e: any) {
    log.warn(`[broll-fetcher] copy to project failed: ${e?.message ?? e}`);
    return null;
  }
  return { relPath: relFromOutDir(projectAbsOutPath), absPath: projectAbsOutPath };
}

/** Compute a relative path string for use in HTML src=. Assumes the file is
 * inside the project's `broll/` subdir; returns "broll/<basename>". */
function relFromOutDir(absPath: string): string {
  const parts = absPath.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1];
  return `broll/${last}`;
}
