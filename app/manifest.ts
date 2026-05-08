import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Temp",
    short_name: "Temp",
    description: "Temporary jobs marketplace for Kenya.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#11120D",
    theme_color: "#11120D",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" }
    ],
    categories: ["business", "productivity", "utilities"]
  };
}
