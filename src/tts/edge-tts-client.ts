import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TtsClient } from "./tts-client.js";

export interface EdgeOpts {
  /** Edge neural voice name, e.g. "vi-VN-NamMinhNeural" or "vi-VN-HoaiMyNeural". */
  voice: string;
  /** Speech speed multiplier (1.0 = normal). Mapped to edge `--rate` percentage. */
  speed?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Free, unlimited Vietnamese TTS via Microsoft Edge's online neural voices
 * (the `edge-tts` Python CLI). No API key, no quota, no per-character cost.
 *
 * The render workflow installs it with `pip install edge-tts`; locally the
 * same package powers the Cloak screencast pilots. We shell out instead of
 * re-implementing the (token-gated) websocket protocol in Node, which is far
 * more brittle than the maintained CLI.
 */
export class EdgeTtsClient implements TtsClient {
  constructor(private cfg: EdgeOpts) {}

  async generate(text: string, audioOutPath: string, srtOutPath?: string): Promise<void> {
    const pct = Math.round(((this.cfg.speed ?? 1) - 1) * 100);
    const rate = `${pct >= 0 ? "+" : ""}${pct}%`;

    // Pass text via a temp file (not argv) to avoid shell-quoting issues with
    // Vietnamese text + punctuation.
    const dir = await mkdtemp(join(tmpdir(), "edgetts-"));
    const txtPath = join(dir, "in.txt");
    await writeFile(txtPath, text, "utf8");

    const args = [
      "--voice", this.cfg.voice,
      `--rate=${rate}`,
      "--file", txtPath,
      "--write-media", audioOutPath,
    ];
    if (srtOutPath) args.push("--write-subtitles", srtOutPath);

    // edge-tts occasionally returns a transient "NoAudioReceived" → retry.
    const attempts = 4;
    let lastErr: unknown;
    try {
      for (let i = 0; i < attempts; i++) {
        try {
          await this.run(args);
          const s = await stat(audioOutPath).catch(() => null);
          if (s && s.size > 0) return;
          throw new Error("edge-tts produced an empty audio file");
        } catch (e) {
          lastErr = e;
          await sleep(1500 * (i + 1));
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    throw new Error(`edge-tts failed after ${attempts} attempts: ${String(lastErr).slice(0, 300)}`);
  }

  /** Try `edge-tts`, then `python3 -m edge_tts`, then `python -m edge_tts`.
   *  Only advance to the next invocation when the command itself is missing. */
  private async run(args: string[]): Promise<void> {
    const candidates: Array<[string, string[]]> = [
      ["edge-tts", args],
      ["python3", ["-m", "edge_tts", ...args]],
      ["python", ["-m", "edge_tts", ...args]],
    ];
    let lastErr: unknown;
    for (const [cmd, a] of candidates) {
      try {
        await this.spawnOnce(cmd, a);
        return;
      } catch (e) {
        lastErr = e;
        if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
      }
    }
    throw lastErr;
  }

  private spawnOnce(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      proc.stderr?.on("data", (d) => { err += d.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)),
      );
    });
  }
}
