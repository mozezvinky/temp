import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Shell } from "@/components/layout/Shell";
import { Toaster } from "sonner";
import { PwaBootstrap } from "@/components/pwa/PwaBootstrap";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Temp - Kenya temporary jobs marketplace",
  description: "A secure temporary gig-work marketplace for Kenyan clients and workers.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Temp" },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#11120D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <PwaBootstrap />
          <Shell>{children}</Shell>
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </body>
    </html>
  );
}
