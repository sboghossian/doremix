/**
 * BYO-key + model settings, stored in IndexedDB (via idb), local-first.
 *
 * The OpenRouter API key NEVER leaves the machine except in the user's own
 * browser → OpenRouter TLS call (made by the real conductor). It is NEVER
 * logged, NEVER sent to any Doremix server, and stored in IndexedDB (not
 * localStorage) per the architecture's security note.
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "doremix-settings";
const STORE = "kv";
const KEY_OPENROUTER = "openrouter_key";
const KEY_MODEL = "openrouter_model";

/** A strong default reasoner on OpenRouter; the user can change it in Settings. */
export const DEFAULT_MODEL = "anthropic/claude-3.7-sonnet";

export interface DoremixSettings {
  /** present only if the user has pasted a key */
  apiKey: string | null;
  model: string;
}

let dbPromise: Promise<IDBPDatabase | null> | null = null;

function getDB(): Promise<IDBPDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    if (typeof indexedDB === "undefined") return null;
    try {
      return await openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        },
      });
    } catch {
      return null;
    }
  })();
  return dbPromise;
}

/** Read the stored OpenRouter key, or null. Result is sensitive — never log it. */
export async function getOpenRouterKey(): Promise<string | null> {
  const db = await getDB();
  if (!db) return null;
  try {
    const v = (await db.get(STORE, KEY_OPENROUTER)) as string | undefined;
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Persist the OpenRouter key. Trims; empty string clears it. */
export async function setOpenRouterKey(key: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const trimmed = key.trim();
  try {
    if (trimmed.length === 0) {
      await db.delete(STORE, KEY_OPENROUTER);
    } else {
      await db.put(STORE, trimmed, KEY_OPENROUTER);
    }
  } catch {
    // non-fatal
  }
}

export async function getModel(): Promise<string> {
  const db = await getDB();
  if (!db) return DEFAULT_MODEL;
  try {
    const v = (await db.get(STORE, KEY_MODEL)) as string | undefined;
    return v && v.length > 0 ? v : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export async function setModel(model: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  const trimmed = model.trim() || DEFAULT_MODEL;
  try {
    await db.put(STORE, trimmed, KEY_MODEL);
  } catch {
    // non-fatal
  }
}

/** Read both at once. */
export async function getSettings(): Promise<DoremixSettings> {
  const [apiKey, model] = await Promise.all([getOpenRouterKey(), getModel()]);
  return { apiKey, model };
}

/** Clear the key (and reset model to default). Used by the "Clear key" button. */
export async function clearSettings(): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    await db.delete(STORE, KEY_OPENROUTER);
    await db.delete(STORE, KEY_MODEL);
  } catch {
    // non-fatal
  }
}

/** True if a usable OpenRouter key is stored (used to decide live vs demo). */
export async function hasOpenRouterKey(): Promise<boolean> {
  return (await getOpenRouterKey()) !== null;
}
