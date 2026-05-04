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
    },
  },
  plugins: [],
};
