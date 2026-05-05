/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#1e1e2e",
        base: "#11111b",
        overlay: "#313244",
        muted: "#6c7086",
        "blue-accent": "#60a5fa",
        "red-accent": "#f87171",
        "amber-accent": "#fbbf24",
        "green-accent": "#34d399",
        "purple-accent": "#a78bfa",
      },
      animation: {
        "pulse-slow": "pulse 2.5s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        shimmer: "shimmer 1.8s infinite linear",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
    },
  },
  plugins: [],
};
