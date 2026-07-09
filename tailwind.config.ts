import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./data/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#0071E3",
        canvas: "#f6f7f9",
        ink: "#111827",
        muted: "#707784",
        line: "#e6e9ef",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
      boxShadow: {
        soft: "0 4px 14px rgba(0, 0, 0, 0.05)",
        brand: "0 6px 16px rgba(0, 0, 0, 0.06)",
      },
      borderRadius: {
        card: "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
