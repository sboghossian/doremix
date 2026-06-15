import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0B0F",
        "ink-2": "#14141B",
        "ink-3": "#1E1E28",
        paper: "#F4F1EA",
        mist: "#A6A3B0",
        energy1: "#FF3D81",
        energy2: "#FF9F1C",
        energy3: "#2EC4B6",
        live: "#3DFF88",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightish: "-0.02em",
      },
      backgroundImage: {
        energy: "linear-gradient(90deg, #FF3D81 0%, #FF9F1C 50%, #2EC4B6 100%)",
        "energy-v": "linear-gradient(180deg, #FF3D81 0%, #FF9F1C 50%, #2EC4B6 100%)",
      },
      transitionTimingFunction: {
        confident: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        drift: {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(-1.5%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "pulse-live": "pulse-live 1.4s ease-in-out infinite",
        drift: "drift 9s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
