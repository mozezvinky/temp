import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "COPIC Help | Support for Jobs and Local Services",
  description: "Get COPIC support for posting work, applying for jobs, direct payment confirmation, secure chat, account access, and local services in Kenya.",
  alternates: {
    canonical: "/help"
  }
};

export default function HelpLayout({ children }: { children: ReactNode }) {
  return children;
}

