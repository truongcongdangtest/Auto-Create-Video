import "dotenv/config";

export type TtsProvider = "lucylab" | "elevenlabs" | "edge";

export interface TiktokConfig {
  displayName: string;
  handle: string;
  followers: string;
  /** URL to download avatar JPG. If undefined, the bundled `assets/avatar.jpg` is used. */
  avatarUrl?: string;
}

export interface Config {
  ttsProvider: TtsProvider;

  // LucyLab
  lucylabApiKey?: string;
  lucylabVoiceId?: string;
  lucylabEndpoint: string;
  lucylabPollIntervalMs: number;
  lucylabPollTimeoutMs: number;

  // ElevenLabs
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModelId: string;
  elevenlabsEndpoint: string;

  // Edge-TTS (free, no API key) — Microsoft online neural voices via the
  // `edge-tts` CLI. Unlimited; the render workflow runs `pip install edge-tts`.
  edgeVoice: string;

  // TikTok follow card (outro)
  tiktok: TiktokConfig;

  // Background music bed mixed under the voice. Enabled by default with a
  // bundled wuxia/guzheng track; tune via BGM_* env vars.
  bgm: {
    enabled: boolean;
    /** Absolute/relative path override; undefined → pipeline uses bundled default. */
    path?: string;
    /** 0–1 ducked volume under the voice. */
    volume: number;
  };

  /** TTS speech speed multiplier (1.0 = normal). <1 = slower/calmer storytelling pace. */
  voiceSpeed: number;

  ttsConcurrency: number;

  // B-roll (Pexels) — both optional; if either missing, b-roll step is
  // skipped and the pipeline falls back to existing static-image/gradient bg.
  pexelsApiKey?: string;
  geminiApiKey?: string;
  brollEnabled: boolean;

  // AI still-image backgrounds (Pollinations, free, no key). When enabled, the
  // pipeline generates ONE image per scene that matches the narration and
  // renders it as a Ken-Burns still background. Still images decode once (not
  // per-frame like <video>), so this renders LIGHT on the free 2-vCPU runner —
  // unlike the Pexels VIDEO b-roll path. Mutually exclusive with b-roll: when
  // aiImagesEnabled is on, the heavy video b-roll fetch is skipped.
  aiImagesEnabled: boolean;
}

function intDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`Env var ${name} must be integer, got "${v}"`);
  return n;
}

function floatDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseFloat(v);
  if (isNaN(n)) throw new Error(`Env var ${name} must be a number, got "${v}"`);
  return n;
}

export function loadConfig(): Config {
  const provider = (process.env.TTS_PROVIDER ?? "lucylab") as TtsProvider;
  if (provider !== "lucylab" && provider !== "elevenlabs" && provider !== "edge") {
    throw new Error(`TTS_PROVIDER must be "lucylab", "elevenlabs" or "edge", got "${provider}"`);
  }

  // Validate provider-specific required vars
  if (provider === "lucylab") {
    if (!process.env.VIETNAMESE_API_KEY || process.env.VIETNAMESE_API_KEY.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_API_KEY (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab API key.`
      );
    }
    if (!process.env.VIETNAMESE_VOICEID || process.env.VIETNAMESE_VOICEID.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_VOICEID (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab voice ID.`
      );
    }
  } else if (provider === "elevenlabs") {
    if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY.trim() === "") {
      throw new Error(
        `Missing ELEVENLABS_API_KEY (required when TTS_PROVIDER=elevenlabs). ` +
        `Copy .env.example to .env.local and fill in your ElevenLabs API key.`
      );
    }
    if (!process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID.trim() === "") {
      throw new Error(
        `Missing ELEVENLABS_VOICE_ID (required when TTS_PROVIDER=elevenlabs). ` +
        `Copy .env.example to .env.local and fill in your ElevenLabs voice ID.`
      );
    }
  }

  return {
    ttsProvider: provider,
    lucylabApiKey: process.env.VIETNAMESE_API_KEY,
    lucylabVoiceId: process.env.VIETNAMESE_VOICEID,
    lucylabEndpoint: process.env.LUCYLAB_ENDPOINT ?? "https://api.lucylab.io/json-rpc",
    lucylabPollIntervalMs: intDefault("LUCYLAB_POLL_INTERVAL_MS", 2000),
    lucylabPollTimeoutMs: intDefault("LUCYLAB_POLL_TIMEOUT_MS", 120000),
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenlabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    elevenlabsEndpoint: process.env.ELEVENLABS_ENDPOINT ?? "https://api.elevenlabs.io/v1",
    edgeVoice: process.env.EDGE_VOICE ?? "vi-VN-NamMinhNeural",
    tiktok: {
      // Empty by default → no footer handle pill, no outro follow card. Set
      // these env vars only when you have a real channel to promote.
      displayName: process.env.TIKTOK_DISPLAY_NAME ?? "",
      handle: process.env.TIKTOK_HANDLE ?? "",
      followers: process.env.TIKTOK_FOLLOWERS ?? "",
      avatarUrl: process.env.TIKTOK_AVATAR_URL || undefined,
    },
    bgm: {
      // On by default; set BGM_ENABLED=0/false/no/off to disable.
      enabled: !["0", "false", "no", "off"].includes((process.env.BGM_ENABLED ?? "").toLowerCase().trim()),
      path: process.env.BGM_PATH?.trim() || undefined,
      volume: floatDefault("BGM_VOLUME", 0.13),
    },
    voiceSpeed: floatDefault("VOICE_SPEED", 1.0),
    ttsConcurrency: intDefault("TTS_CONCURRENCY", 1),
    pexelsApiKey: process.env.PEXELS_API_KEY?.trim() || undefined,
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
    // BROLL_ENABLED defaults true when PEXELS_API_KEY is set; explicit "0"/"false" disables.
    // When AI images are enabled, force b-roll OFF (the two are mutually exclusive —
    // AI still images are the light, free-render path; video b-roll is the heavy one).
    brollEnabled:
      !["1", "true", "yes", "on"].includes((process.env.AI_IMAGES ?? "").toLowerCase().trim()) &&
      (process.env.PEXELS_API_KEY?.trim() || "") !== "" &&
      !["0", "false", "no"].includes((process.env.BROLL_ENABLED ?? "").toLowerCase().trim()),
    // AI_IMAGES=1/true/yes/on turns on Pollinations still-image backgrounds. No key needed.
    aiImagesEnabled:
      ["1", "true", "yes", "on"].includes((process.env.AI_IMAGES ?? "").toLowerCase().trim()),
  };
}
