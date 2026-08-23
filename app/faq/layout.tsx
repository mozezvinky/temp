import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "COPIC FAQ | Questions About Local Work and Services",
  description: "Find answers to common questions about using COPIC for jobs, applications, support, payments, chat, and local services in Kenya.",
  alternates: {
    canonical: "/faq"
  }
};

export default function FaqLayout({ children }: { children: ReactNode }) {
  return children;
}

