import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./context/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        smoky: "#11120D",
        olive: "#565449",
        bone: "#D8CFBC",
        floral: "#FFFBF4"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(0,0,0,.28)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
