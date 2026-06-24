/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        chrome: {
          bg: "#1e1e22",
          panel: "#26262b",
          border: "#36363d",
          text: "#d6d6da",
          muted: "#8b8b93",
          accent: "#5b8cff",
        },
      },
    },
  },
  plugins: [],
};
