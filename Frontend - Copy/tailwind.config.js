/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#004A77",
          50:  "#e6f0f7",
          100: "#cce1ef",
          200: "#99c3df",
          300: "#66a5cf",
          400: "#3387bf",
          500: "#004A77",   // base
          600: "#003d63",
          700: "#00304f",
          800: "#00243b",
          900: "#001727",
        },
        secondary: {
          DEFAULT: "#455A64",
          50:  "#eceff1",
          100: "#cfd8dc",
          200: "#b0bec5",
          300: "#90a4ae",
          400: "#78909c",
          500: "#455A64",   // base
          600: "#37474f",
          700: "#263238",
          800: "#1c252a",
          900: "#121820",
        },
        tertiary: {
          DEFAULT: "#6E3900",
          50:  "#fdf0e6",
          100: "#fad8b0",
          200: "#f5b56a",
          300: "#e8922a",
          400: "#c47010",
          500: "#6E3900",   // base
          600: "#5a2f00",
          700: "#462500",
          800: "#321b00",
          900: "#1e1000",
        },
        neutral: {
          DEFAULT: "#75777B",
          50:  "#f4f4f5",
          100: "#e4e4e7",
          200: "#d4d4d8",
          300: "#a1a1aa",
          400: "#75777B",   // base
          500: "#52525b",
          600: "#3f3f46",
          700: "#27272a",
          800: "#18181b",
          900: "#09090b",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
}