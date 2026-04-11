import type { Config } from "tailwindcss";

/**
 * AvoVita Midnight Forest Theme
 * Tailwind v4 reads the active palette from @theme in globals.css.
 * This file mirrors those values for documentation and any tooling
 * that still reads a classic tailwind.config.ts.
 */
const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        "bg-primary": "#0a1a0d",
        "bg-secondary": "#0f2614",
        "bg-tertiary": "#1a3d22",
        "bg-hover": "#1f4a28",

        // Borders
        "border-default": "#2d6b35",
        "border-subtle": "#1a3d22",

        // Text
        "text-primary": "#ffffff",
        "text-secondary": "#e8d5a3",
        "text-muted": "#6ab04c",

        // Gold (primary CTA)
        "gold": "#c4973a",
        "gold-hover": "#d4a84a",

        // Greens
        "green-accent": "#8dc63f",
        "green-dark": "#2d6b35",

        // Status
        "status-success": "#6ab04c",
        "status-danger": "#e05252",
        "status-warning": "#c4973a",
      },
      fontFamily: {
        heading: ['"Cormorant Garamond"', "Georgia", "serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
