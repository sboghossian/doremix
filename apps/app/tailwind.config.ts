import type { Config } from "tailwindcss";

/**
 * Doremix v2 tokens — vivid club-light spectrum. Dark glassy canvas, ALIVE
 * with color. Tokens mirror brand/BRAND.md v2. Chroma comes from the signature
 * gradient + glow + the drifting gradient-mesh background.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A12",
        "ink-2": "#10101C",
        "ink-3": "#1A1A2A",
        paper: "#F6F4FF",
        mist: "#B4B0CC",
        live: "#3DFF88",
        // the spectrum (the club lights)
        magenta: "#FF2E97",
        coral: "#FF6B3D",
        amber: "#FFB627",
        teal: "#2EE6C4",
        cyan: "#2EA8FF",
        violet: "#9B5CFF",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightish: "-0.02em",
      },
      borderRadius: {
        glass: "20px",
      },
      backgroundImage: {
        // signature spectrum gradient — wordmark, curve, CTAs, glows
        spectrum:
          "linear-gradient(120deg, #FF2E97, #FF6B3D, #FFB627, #2EE6C4, #2EA8FF, #9B5CFF)",
        "spectrum-v":
          "linear-gradient(180deg, #FF2E97, #FF6B3D, #FFB627, #2EE6C4, #2EA8FF, #9B5CFF)",
      },
      boxShadow: {
        // colored glows
        "glow-magenta": "0 0 40px rgba(255,46,151,0.35)",
        "glow-cyan": "0 0 40px rgba(46,168,255,0.32)",
        "glow-violet": "0 0 40px rgba(155,92,255,0.32)",
        "glow-live": "0 0 30px rgba(61,255,136,0.4)",
        glass: "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.4)",
      },
      transitionTimingFunction: {
        confident: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        // signature gradient drift (position shift) — the "alive" gradient
        "gradient-pan": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        // slow drifting blobs = the room's moving lights
        "blob-a": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(8%, -6%) scale(1.12)" },
          "66%": { transform: "translate(-6%, 5%) scale(0.94)" },
        },
        "blob-b": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-7%, 6%) scale(0.92)" },
          "66%": { transform: "translate(6%, -5%) scale(1.1)" },
        },
        "blob-c": {
          "0%, 100%": { transform: "translate(0, 0) scale(1.05)" },
          "50%": { transform: "translate(5%, 7%) scale(0.95)" },
        },
        "beat-glow": {
          "0%, 100%": { filter: "drop-shadow(0 0 6px rgba(255,46,151,0.5))" },
          "50%": { filter: "drop-shadow(0 0 18px rgba(46,168,255,0.85))" },
        },
      },
      animation: {
        "fade-in": "fade-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "pulse-live": "pulse-live 1.2s ease-in-out infinite",
        "gradient-pan": "gradient-pan 8s ease-in-out infinite",
        "blob-a": "blob-a 26s ease-in-out infinite",
        "blob-b": "blob-b 32s ease-in-out infinite",
        "blob-c": "blob-c 22s ease-in-out infinite",
        "beat-glow": "beat-glow 0.7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
