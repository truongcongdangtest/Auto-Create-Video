import { spawn } from "node:child_process";
import { log } from "../utils/logger.js";

export interface RenderArgs {
  compositionDir: string;  // path to composition directory
  outputPath: string;      // path for .mp4
  fps?: number;            // default 30
  quality?: "draft" | "standard" | "high"; // default "standard"
}

// Windows + shell:true does NOT auto-quote the args array — it just
// concats with spaces, splitting paths like "C:\\Users\\FPT MONG CAI\\..."
// on the first space. Quote each path defensively for cmd.exe.
const isWin = process.platform === "win32";
const cmdQuote = (s: string): string =>
  isWin ? `"${s.replace(/"/g, '""')}"` : s;

export async function renderWithHyperframes(args: RenderArgs): Promise<void> {
  // Env overrides for users who want a fast preview pass at the cost of
  // visual fidelity. AMD Ryzen + AMD iGPU machines fall back to CPU x264
  // (hyperframes does NOT support AMD AMF) — draft preset (`ultrafast`)
  // is the biggest single lever there, cutting the encoder phase ~6x.
  //
  //   VIETVIRAL_RENDER_QUALITY=draft|standard|high  (default: standard)
  //   VIETVIRAL_RENDER_FPS=24|30                    (default: 30)
  //   VIETVIRAL_RENDER_WORKERS=1..8                 (default: auto)
  const qualityOverride = (process.env.VIETVIRAL_RENDER_QUALITY ?? "").toLowerCase();
  const fpsOverride = Number(process.env.VIETVIRAL_RENDER_FPS ?? "");
  const workersOverride = Number(process.env.VIETVIRAL_RENDER_WORKERS ?? "");

  const quality = ["draft", "standard", "high"].includes(qualityOverride)
    ? (qualityOverride as "draft" | "standard" | "high")
    : args.quality ?? "standard";
  const fps = Number.isFinite(fpsOverride) && fpsOverride > 0
    ? Math.max(15, Math.min(60, Math.floor(fpsOverride)))
    : args.fps ?? 30;
  const workers = Number.isFinite(workersOverride) && workersOverride > 0
    ? Math.max(1, Math.min(8, Math.floor(workersOverride)))
    : null;

  const { compositionDir, outputPath } = args;

  // GPU encoding: hyperframes 0.4.34+ ships `--gpu` which picks the first
  // compiled-in hardware encoder from {h264_nvenc, h264_videotoolbox,
  // h264_qsv}. ffmpeg often has these compiled in even when the runtime
  // driver is missing (e.g. AMD machine with NVENC compiled in but no
  // NVIDIA driver → `--gpu` fails with Invalid argument and aborts the
  // whole render). hyperframes does NOT support AMD AMF.
  //
  // VietViral's engine.mjs runs a runtime probe before spawning ACV and
  // sets `VIETVIRAL_USE_GPU=1` only if the encoder hyperframes will pick
  // actually works on this machine. Opt-out via `VIETVIRAL_NO_GPU=1`.
  const useGpu =
    process.env.VIETVIRAL_USE_GPU === "1" && process.env.VIETVIRAL_NO_GPU !== "1";

  // HDR mode: hyperframes auto-detects HDR from source media (Pexels broll often
  // carries HLG/BT.2020 metadata). When auto-detected, it switches to libx265
  // CPU encode (10-bit BT.2020), silently bypassing `--gpu` because NVENC HEVC
  // 10-bit has tighter codec param requirements that hyperframes doesn't wire.
  // The visible symptom: CPU at 95%, GPU at idle, even with `--gpu` passed.
  //
  // We default to `--sdr` which forces standard h264 8-bit BT.709 output,
  // which IS GPU-accelerated by NVENC. TikTok/Reels/Shorts deliver SDR anyway
  // — HDR is overkill for 60-second short-form content and costs ~5x render
  // time vs SDR+NVENC on this same machine.
  //
  // Power users who genuinely need HDR can opt in via VIETVIRAL_HDR_MODE:
  //   force-sdr (default)  → --sdr, NVENC active
  //   auto                 → no flag, hyperframes detects from sources (legacy behaviour, slow)
  //   force-hdr            → --hdr, libx265 CPU, 10-bit HLG
  const hdrModeOverride = (process.env.VIETVIRAL_HDR_MODE ?? "").toLowerCase();
  const hdrFlag =
    hdrModeOverride === "force-hdr" ? ["--hdr"]
      : hdrModeOverride === "auto" ? []
        : ["--sdr"];

  log.info(
    `hyperframes args: quality=${quality} fps=${fps}${workers ? ` workers=${workers}` : ""} gpu=${useGpu ? "yes" : "no"} hdr=${hdrFlag[0] ?? "auto"}`,
  );

  const cmdLine = [
    "npx",
    "hyperframes",
    "render",
    cmdQuote(compositionDir),
    "--output",
    cmdQuote(outputPath),
    "--fps",
    String(fps),
    "--quality",
    quality,
    ...(workers ? ["--workers", String(workers)] : []),
    ...hdrFlag,
    ...(useGpu ? ["--gpu"] : []),
  ].join(" ");

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(cmdLine, [], {
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `hyperframes render failed with exit code ${code}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });

  log.info(`Rendered: ${outputPath}`);
}
