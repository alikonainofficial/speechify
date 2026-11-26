/** @type {import('tailwindcss').Config} */
const color = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: color("paper"),
        surface: color("surface"),
        ink: color("ink"),
        muted: color("muted"),
        line: color("line"),
        accent: color("accent"),
        "accent-ink": color("accent-ink"),
        rec: color("rec"),
        "rec-ink": color("rec-ink"),
        danger: color("danger"),
      },
      fontFamily: {
        // System fonts only: no web-font requests.
        sans: ['system-ui', '-apple-system', '"Segoe UI"', "Roboto", '"Helvetica Neue"', "Arial", "sans-serif"],
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', "Palatino", '"Book Antiqua"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
