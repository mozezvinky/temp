import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./plan-b-theme.css";
import { AuthProvider } from "@/context/AuthContext";
import { Shell } from "@/components/layout/Shell";
import { Toaster } from "sonner";
import { PwaBootstrap } from "@/components/pwa/PwaBootstrap";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Copic - Connecting people, earning income, and building careers.",
  description: "Connect with opportunities, hire skilled workers, and take your career to the next level.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Copic" },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#1E1E1E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
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
