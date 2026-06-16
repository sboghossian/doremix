import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Vitest config for the engine's PURE-logic smoke tests. A real AudioContext
 * can't run headless, so we test the bar-clock math, tempo-match ratio,
 * transition scheduling, cue execution, and re-plan freezing directly — the
 * deterministic core that `RealEngine` writes onto Web Audio params.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
