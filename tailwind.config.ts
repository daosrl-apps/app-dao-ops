import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      fontFamily: {
        // Tipografía global del sitio. Impact es font de sistema en Windows /
        // macOS / iOS. Para Android (y otros) caemos a Anton (Google Font
        // cargada en layout.tsx) que es visualmente muy parecida, y de ahí a
        // otras condensadas como último recurso.
        sans: [
          "Impact",
          "Anton",
          "Haettenschweiler",
          "Arial Narrow Bold",
          "Oswald",
          "system-ui",
          "sans-serif",
        ],
        // Para timers y números: mismo stack que sans (Impact tiene buena
        // legibilidad en dígitos), pero forzamos tabular-nums via la utility
        // de Tailwind donde haga falta.
        mono: [
          "Impact",
          "Anton",
          "Haettenschweiler",
          "Arial Narrow Bold",
          "Oswald",
          "ui-monospace",
          "monospace",
        ],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
