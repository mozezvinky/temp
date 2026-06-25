import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./context/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        smoky: "#000000",
        olive: "#334F00",
        bone: "#FFFFFF",
        floral: "#F8F9FA",
        tertiary: "#F3F4F5",
        lime: "#B2F746"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(0,0,0,.28)"
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      borderRadius: {
        DEFAULT: ".5rem",
        md: ".75rem",
        lg: "1rem",
        xl: "1.5rem"
      }
    }
  },
  plugins: []
};

export default config;
