import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Copic",
    short_name: "Copic",
    description: "Connecting people, earning income, and building careers.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F5F5F5",
    theme_color: "#1E1E1E",
    orientation: "portrait",
    icons: [
      { src: "/icons/pic-icon.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" }
    ],
    categories: ["business", "productivity", "utilities"]
  };
}
