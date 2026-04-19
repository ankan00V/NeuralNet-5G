/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        core: {
          bg: "var(--bg-page)",
          surface: "var(--bg-card)",
          surfaceHover: "var(--bg-card-raised)",
          border: "var(--border)",
          borderLight: "var(--border-strong)",
          text: "var(--text-primary)",
          textMuted: "var(--text-secondary)",
          primary: "var(--color-playbook)",
          primaryHover: "var(--color-playbook-text)",
          accent: "var(--accent)",
        },
        apple: {
          black: "var(--bg-page)",
          gray: "var(--bg-page)",
          dark: "var(--text-primary)",
          blue: "var(--accent)",
          link: "var(--accent)",
          linkDark: "var(--accent-hover)",
          border: "#2A2A35",
          surface: "#111116",
          darkSurface: "#181820",
        },
        green: "#10B981",
        amber: "#F59E0B",
        red: "#EF4444",
      },
      boxShadow: {
        "glow-primary": "0 0 20px rgba(59, 130, 246, 0.15)",
        "glow-critical": "0 0 20px rgba(239, 68, 68, 0.15)",
        "apple-lift": "0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
        "apple-hover": "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)",
      },
      borderRadius: {
        "apple-pill": "6px",
      },
      fontFamily: {
        sans: ['"Inter"', "sans-serif"],
        display: ['"Inter"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      letterSpacing: {
        "tightest": "-0.04em",
        "tighter": "-0.02em",
        "tight": "-0.01em",
        "normal": "0",
        "wide": "0.02em",
        "wider": "0.04em",
        "widest": "0.1em",
        "apple-tight": "-0.01em",
        "apple-tighter": "-0.02em",
        "apple-loose": "0.02em",
        "apple-caption": "0",
        "apple-micro": "0.04em",
      },
      transitionTimingFunction: {
        tech: "cubic-bezier(0.4, 0, 0.2, 1)",
        apple: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(12px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "panel-in": {
          "0%": {
            opacity: "0",
            transform: "translateX(16px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)",
          },
        },
        "tower-pulse": {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "1",
          },
          "50%": {
            transform: "scale(1.08)",
            opacity: "0.84",
          },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 400ms cubic-bezier(0.4, 0, 0.2, 1) both",
        "fade-in": "fade-in 400ms ease both",
        "panel-in": "panel-in 250ms cubic-bezier(0.4, 0, 0.2, 1) both",
        "tower-pulse": "tower-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
