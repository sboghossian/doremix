/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SCREENSHOT IMPORT — Spotify/playlist screenshot → tracklist (vision).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   importScreenshot(file)  →  { ok, tracks: [{title, artist}], ... }
 *
 * Reads the user's BYO key + model, converts the uploaded image to a data URL,
 * asks the model (multimodal) to read the playlist, and parses the JSON list of
 * { title, artist }. The caller (the Library "upload screenshot" path) then runs
 * those names through the SAME fuzzy matcher the pasted-text import uses, and the
 * existing UI shows matched vs "not in your library".
 *
 * Never throws — every failure (no key, not an image, oversized, API error,
 * unparseable) returns a typed result so the UI can show a friendly note.
 */

import { getModel, getOpenRouterKey } from "@/store/settings";
import { vision } from "./openrouter";
import { extractJson } from "./schema";
import { screenshotPrompt } from "./prompts";

export interface ScreenshotTrack {
  title: string;
  artist: string;
}

export type ScreenshotErrorKind =
  | "no_key"
  | "not_image"
  | "too_large"
  | "read_failed"
  | "api"
  | "empty"
  | "parse";

export type ScreenshotResult =
  | { ok: true; tracks: ScreenshotTrack[] }
  | { ok: false; kind: ScreenshotErrorKind; message: string };

/** Hard cap so we never base64 a giant file into a request body. */
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** Read a File into a `data:<mime>;base64,...` URL. Resolves null on failure. */
export function fileToDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof FileReader === "undefined") {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const r = reader.result;
      resolve(typeof r === "string" ? r : null);
    };
    try {
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}

function parseTracks(text: string): ScreenshotTrack[] | null {
  const obj = extractJson(text);
  if (!obj) return null;
  const arr = (obj as { tracks?: unknown }).tracks;
  if (!Array.isArray(arr)) return null;
  const out: ScreenshotTrack[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const title = (item as { title?: unknown }).title;
    const artist = (item as { artist?: unknown }).artist;
    if (typeof title !== "string" || title.trim().length === 0) continue;
    out.push({
      title: title.trim(),
      artist: typeof artist === "string" ? artist.trim() : "",
    });
  }
  return out;
}

/**
 * Extract a tracklist from an uploaded playlist screenshot via the vision model.
 */
export async function importScreenshot(file: File): Promise<ScreenshotResult> {
  if (!(file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(file.name))) {
    return { ok: false, kind: "not_image", message: "That doesn't look like an image. Upload a screenshot (PNG/JPG)." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, kind: "too_large", message: "That image is too large — try a screenshot under 8 MB." };
  }

  const [key, model] = await Promise.all([getOpenRouterKey(), getModel()]);
  if (!key) {
    return { ok: false, kind: "no_key", message: "Add your OpenRouter key in Settings to read screenshots." };
  }

  const dataUrl = await fileToDataUrl(file);
  if (!dataUrl) {
    return { ok: false, kind: "read_failed", message: "Couldn't read that image file." };
  }

  const res = await vision({
    key,
    model,
    prompt: screenshotPrompt(),
    imageDataUrl: dataUrl,
    maxTokens: 2000,
  });

  if (!res.ok) {
    // surface the OpenRouter error message (already key-safe + friendly)
    return { ok: false, kind: res.error.kind === "empty" ? "empty" : "api", message: res.error.message };
  }

  const tracks = parseTracks(res.content);
  if (tracks === null) {
    return { ok: false, kind: "parse", message: "Couldn't read a tracklist from that screenshot." };
  }
  if (tracks.length === 0) {
    return { ok: false, kind: "empty", message: "No songs spotted in that screenshot." };
  }
  return { ok: true, tracks };
}
