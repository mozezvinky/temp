import type { MetadataRoute } from "next";
import { canonical } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/applications",
        "/auth",
        "/chat",
        "/complete-profile",
        "/completed-requests",
        "/account-settings",
        "/dashboard",
        "/find-work",
        "/jobs",
        "/login",
        "/notifications",
        "/payment-setup",
        "/profile",
        "/settings",
        "/signup",
        "/verify-email",
        "/wallet",
        "/workers"
      ]
    },
    sitemap: canonical("/sitemap.xml")
  };
}
