/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  OPENROUTER CLIENT — thin browser-side fetch wrapper.   (framework-free)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * BYO key: the call goes straight from the user's browser to OpenRouter over
 * TLS. We send the etiquette headers (`HTTP-Referer` + `X-Title`) OpenRouter
 * asks for — they also enable the permissive CORS path for browser callers.
 *
 * Two shapes:
 *   chat({ model, key, system, user, json })          → text content
 *   vision({ model, key, prompt, imageDataUrl })       → text content
 *
 * NOTHING here throws. Every failure mode (no key, 401/402/429, network, empty
 * body, non-JSON) comes back as a typed `OpenRouterError` in a discriminated
 * `OpenRouterResult`, so the conductor can turn it into a friendly chat line
 * instead of crashing the UI.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterErrorKind =
  | "no_key"
  | "auth" // 401
  | "payment" // 402 (out of credits)
  | "rate_limit" // 429
  | "bad_request" // 4xx other
  | "server" // 5xx
  | "network" // fetch threw (offline / CORS / DNS)
  | "empty" // 200 but no usable content
  | "parse"; // 200 but body wasn't the expected shape

export interface OpenRouterError {
  kind: OpenRouterErrorKind;
  /** HTTP status when there was a response */
  status?: number;
  /** safe, user-facing-ish message (never contains the key) */
  message: string;
}

export type OpenRouterResult =
  | { ok: true; content: string }
  | { ok: false; error: OpenRouterError };

/** Map an HTTP status to a typed error kind + friendly message. */
function errorForStatus(status: number, detail?: string): OpenRouterError {
  if (status === 401) {
    return { kind: "auth", status, message: "OpenRouter rejected the key (401). Check it in Settings." };
  }
  if (status === 402) {
    return {
      kind: "payment",
      status,
      message: "OpenRouter says this key is out of credits (402). Top up at openrouter.ai.",
    };
  }
  if (status === 429) {
    return { kind: "rate_limit", status, message: "OpenRouter is rate-limiting this key (429). Try again in a moment." };
  }
  if (status >= 500) {
    return { kind: "server", status, message: `OpenRouter had a server error (${status}).` };
  }
  return { kind: "bad_request", status, message: `OpenRouter rejected the request (${status})${detail ? `: ${detail}` : ""}.` };
}

/** OpenRouter etiquette headers — also unlock the browser CORS path. */
function headers(key: string): HeadersInit {
  const referer =
    typeof window !== "undefined" && window.location ? window.location.origin : "https://doremix.app";
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": "Doremix",
  };
}

/** Pull `choices[0].message.content` out of an OpenRouter response body. */
function extractContent(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const msg = (choices[0] as { message?: { content?: unknown } }).message;
  const content = msg?.content;
  if (typeof content === "string") return content;
  // some providers return content as an array of parts
  if (Array.isArray(content)) {
    const text = content
      .map((p) => (typeof p === "object" && p !== null && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("");
    return text.length > 0 ? text : null;
  }
  return null;
}

interface PostArgs {
  key: string;
  model: string;
  messages: unknown[];
  json: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** The single network primitive. Returns a typed result, never throws. */
async function post(args: PostArgs): Promise<OpenRouterResult> {
  if (!args.key) {
    return { ok: false, error: { kind: "no_key", message: "No OpenRouter key. Add one in Settings." } };
  }

  const payload: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature ?? 0.4,
  };
  if (args.maxTokens) payload.max_tokens = args.maxTokens;
  if (args.json) payload.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: headers(args.key),
      body: JSON.stringify(payload),
      signal: args.signal,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "network error";
    return { ok: false, error: { kind: "network", message: `Couldn't reach OpenRouter (${message}).` } };
  }

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const errBody: unknown = await res.json();
      if (typeof errBody === "object" && errBody !== null) {
        const m = (errBody as { error?: { message?: unknown } }).error?.message;
        if (typeof m === "string") detail = m;
      }
    } catch {
      // ignore — status alone is enough
    }
    return { ok: false, error: errorForStatus(res.status, detail) };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: { kind: "parse", status: res.status, message: "OpenRouter returned a non-JSON body." } };
  }

  const content = extractContent(body);
  if (content === null || content.trim().length === 0) {
    return { ok: false, error: { kind: "empty", status: res.status, message: "OpenRouter returned an empty response." } };
  }
  return { ok: true, content };
}

export interface ChatArgs {
  key: string;
  model: string;
  system: string;
  user: string;
  /** ask for JSON-object mode (default true for the conductor) */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** A normal text/JSON chat completion. */
export function chat(args: ChatArgs): Promise<OpenRouterResult> {
  return post({
    key: args.key,
    model: args.model,
    json: args.json ?? true,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
    signal: args.signal,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });
}

export interface VisionArgs {
  key: string;
  model: string;
  prompt: string;
  /** a `data:image/...;base64,...` URL (or any image URL the model can fetch) */
  imageDataUrl: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** A multimodal (text + image) completion — used by the screenshot importer. */
export function vision(args: VisionArgs): Promise<OpenRouterResult> {
  return post({
    key: args.key,
    model: args.model,
    json: args.json ?? true,
    temperature: args.temperature ?? 0.1,
    maxTokens: args.maxTokens,
    signal: args.signal,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: args.prompt },
          { type: "image_url", image_url: { url: args.imageDataUrl } },
        ],
      },
    ],
  });
}
