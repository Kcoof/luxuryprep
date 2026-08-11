/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        frame: {
          DEFAULT: "#0f172a",
          deep: "#020617",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
