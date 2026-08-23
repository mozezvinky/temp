import type { MetadataRoute } from "next";
import { legalPolicies } from "@/lib/legal-content";
import { canonical } from "@/lib/seo";

const publicRoutes = ["/", "/about", "/faq", "/help"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = publicRoutes.map(route => ({
    url: canonical(route),
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" as const : "monthly" as const,
    priority: route === "/" ? 1 : 0.7
  }));

  const legalRoutes = legalPolicies.map(policy => ({
    url: canonical(`/legal/${policy.slug}`),
    lastModified: new Date(),
    changeFrequency: "yearly" as const,
    priority: 0.3
  }));

  return [...staticRoutes, ...legalRoutes];
}

