/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        arabic: ["Amiri", "serif"],
      },
      colors: {
        primary: "var(--primary-color)",
        secondary: "var(--secondary-color)",
        textPrimary: "var(--text-primary)",
        textSecondary: "var(--text-secondary)",
        surface: "var(--surface-color)",
      },
      borderRadius: {
        card: "var(--border-radius)",
      },
      boxShadow: {
        card: "var(--shadow)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
