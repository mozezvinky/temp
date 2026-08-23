import type { Metadata } from "next";
import { LandingPageContent } from "@/components/seo/LandingPageContent";
import { canonical, homeSeo, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: homeSeo.title,
  description: homeSeo.description,
  alternates: {
    canonical: canonical("/")
  },
  openGraph: {
    type: "website",
    siteName: "COPIC",
    title: homeSeo.title,
    description: homeSeo.description,
    url: "/",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "COPIC logo" }]
  },
  twitter: {
    card: "summary",
    title: homeSeo.title,
    description: homeSeo.description,
    images: ["/icon-512.png"]
  }
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "COPIC",
    url: canonical("/"),
    logo: canonical("/icon-512.png")
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "COPIC",
    url: canonical("/"),
    inLanguage: "en-KE",
    publisher: {
      "@type": "Organization",
      name: "COPIC",
      url: siteUrl
    }
  }
];

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingPageContent />
    </>
  );
}
