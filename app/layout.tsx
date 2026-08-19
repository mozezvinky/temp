import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./plan-b-theme.css";
import { AuthProvider } from "@/context/AuthContext";
import { Shell } from "@/components/layout/Shell";
import { LegalFooter } from "@/components/layout/LegalFooter";
import { Toaster } from "sonner";
import { PwaBootstrap } from "@/components/pwa/PwaBootstrap";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  applicationName: "Copic",
  title: "COPIC Kenya | Find Reliable Workers & Local Services",
  description: "Find reliable workers for cleaning, moving, gardening, babysitting, shopping and other local services in Kenya. Post a job, choose your price and find the help you need with COPIC.",
  verification: {
    google: "YyrzGzQYzZd2Y69803lpMxgZ2SDlyUfOzeg3cVmyFCo"
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Copic" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#1E1E1E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" id="top" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>
          <PwaBootstrap />
          <Shell>{children}</Shell>
          <LegalFooter />
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </body>
    </html>
  );
}
