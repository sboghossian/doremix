import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MODEL,
  clearSettings,
  getModel,
  getOpenRouterKey,
  setModel as persistModel,
  setOpenRouterKey,
} from "@/store/settings";

/** A short curated list of strong OpenRouter reasoners + a free-text override. */
const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet (Anthropic)" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (Anthropic)" },
  { id: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
  { id: "openai/o3-mini", label: "o3-mini (OpenAI)" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (Google)" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (Meta)" },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** notified after a save/clear so the session can re-evaluate live vs demo */
  onSaved?: () => void;
}

/**
 * BYO OpenRouter key + model. Local-first: the key is stored in IndexedDB on
 * this machine and used directly, browser → OpenRouter. Reuses the v2 glass UI.
 */
export function SettingsModal({ open, onClose, onSaved }: SettingsModalProps) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [reveal, setReveal] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [hadKey, setHadKey] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isCustom = !MODEL_OPTIONS.some((m) => m.id === model);

  // Load current settings each time the modal opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      const [k, m] = await Promise.all([getOpenRouterKey(), getModel()]);
      if (!active) return;
      setHadKey(k !== null);
      setKey(k ?? "");
      if (MODEL_OPTIONS.some((opt) => opt.id === m)) {
        setModel(m);
        setCustomModel("");
      } else {
        setModel(m);
        setCustomModel(m);
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function save() {
    const chosenModel = isCustom ? customModel.trim() || DEFAULT_MODEL : model;
    await Promise.all([setOpenRouterKey(key), persistModel(chosenModel)]);
    setSavedFlash(true);
    setHadKey(key.trim().length > 0);
    window.setTimeout(() => setSavedFlash(false), 1400);
    onSaved?.();
  }

  async function clearKey() {
    await clearSettings();
    setKey("");
    setModel(DEFAULT_MODEL);
    setCustomModel("");
    setHadKey(false);
    onSaved?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div ref={dialogRef} className="glass w-full max-w-lg p-6 shadow-glow-violet">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-spectrum">
            Conductor key
          </h2>
          <button
            onClick={onClose}
            className="font-mono text-xs text-mist hover:text-paper"
            aria-label="Close"
          >
            esc ✕
          </button>
        </div>

        <p className="mb-5 font-body text-sm text-mist">
          Doremix plans your set with an LLM you bring. Paste an{" "}
          <span className="text-paper">OpenRouter</span> key — it's stored locally
          on this machine and used directly, browser → OpenRouter. It never
          touches a Doremix server.
        </p>

        {/* API key */}
        <label className="mb-2 block font-mono text-[11px] uppercase tracking-wide text-mist">
          OpenRouter API key
        </label>
        <div className="flex gap-2">
          <input
            type={reveal ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-or-v1-…"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-glass border border-white/12 bg-black/30 px-3 py-2 font-mono text-sm text-paper outline-none focus:border-cyan/50"
          />
          <button
            onClick={() => setReveal((v) => !v)}
            className="btn-ghost px-3 py-2 text-xs"
            type="button"
          >
            {reveal ? "hide" : "show"}
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-mist/70">
          {hadKey ? "A key is stored on this machine." : "No key stored yet."} Get
          one at openrouter.ai/keys.
        </p>

        {/* Model */}
        <label className="mb-2 mt-5 block font-mono text-[11px] uppercase tracking-wide text-mist">
          Model
        </label>
        <select
          value={isCustom ? "__custom__" : model}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__custom__") {
              setModel(customModel || "");
              if (!customModel) setCustomModel(DEFAULT_MODEL);
            } else {
              setModel(v);
            }
          }}
          className="w-full rounded-glass border border-white/12 bg-black/30 px-3 py-2 font-body text-sm text-paper outline-none focus:border-cyan/50"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id} className="bg-ink-2 text-paper">
              {m.label}
            </option>
          ))}
          <option value="__custom__" className="bg-ink-2 text-paper">
            Custom (enter an OpenRouter model id)…
          </option>
        </select>

        {isCustom && (
          <input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="provider/model-id"
            spellCheck={false}
            className="mt-2 w-full rounded-glass border border-white/12 bg-black/30 px-3 py-2 font-mono text-sm text-paper outline-none focus:border-cyan/50"
          />
        )}

        {/* actions */}
        <div className="mt-6 flex items-center justify-between">
          <button onClick={clearKey} className="font-mono text-xs text-mist/70 hover:text-magenta">
            clear key
          </button>
          <div className="flex items-center gap-3">
            {savedFlash && (
              <span className="font-mono text-[11px] uppercase tracking-wide text-live">
                saved
              </span>
            )}
            <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
              Close
            </button>
            <button onClick={save} className="btn-spectrum px-5 py-2 text-sm">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
