import type { DoremixSet } from "@/types";
import { DEFAULT_RULES } from "@/types";
import { MOCK_LIBRARY } from "@/data/mockLibrary";
import { shortId } from "@/lib/util";

/**
 * localStorage persistence for sets (the "1 session = 1 project" model). The
 * shared global library (crate source) lives elsewhere; here we only persist
 * the project shells — brief, crate ids, chat, and the live cue sheet.
 */

const KEY = "doremix.sets.v2";

export function newSetId(): string {
  return `set-${shortId("")}`;
}

/** Two example sets so the dashboard isn't empty on first open. */
function seedSets(): DoremixSet[] {
  const now = Date.now();
  const allIds = MOCK_LIBRARY.map((t) => t.id);
  return [
    {
      id: newSetId(),
      name: "Sunset rooftop",
      brief: {
        text: "40-min sunset rooftop, build slow, no vocals after the peak",
        lengthMin: 40,
        audience: "sunset_rooftop",
        arc: "plateau_peak",
        rules: { ...DEFAULT_RULES, noVocalsAfterPeak: true },
      },
      crate: allIds.slice(0, 8),
      chat: [],
      cueSheet: null,
      createdAt: now - 1000 * 60 * 60 * 26,
      updatedAt: now - 1000 * 60 * 60 * 26,
    },
    {
      id: newSetId(),
      name: "Warehouse 2am",
      brief: {
        text: "Peak-time warehouse, relentless, harmonic, no breaks",
        lengthMin: 60,
        audience: "warehouse",
        arc: "rising",
        rules: { ...DEFAULT_RULES },
      },
      crate: allIds.slice(4),
      chat: [],
      cueSheet: null,
      createdAt: now - 1000 * 60 * 90,
      updatedAt: now - 1000 * 60 * 90,
    },
  ];
}

export function loadSets(): DoremixSet[] {
  if (typeof window === "undefined") return seedSets();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const seeded = seedSets();
      saveSets(seeded);
      return seeded;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedSets();
    // light shape guard — drop anything missing an id/brief
    return (parsed as DoremixSet[]).filter(
      (s) => typeof s?.id === "string" && s?.brief != null,
    );
  } catch {
    return seedSets();
  }
}

export function saveSets(sets: DoremixSet[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sets));
  } catch {
    // storage full / disabled — non-fatal, the session still works in-memory
  }
}
