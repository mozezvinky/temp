import { configuredDomain } from "@/lib/production-env";
import { Mail } from "lucide-react";
import Link from "next/link";

const footerColumns = [
  {
    title: "Information",
    links: [
      ["Home", "/"],
      ["About", "/about"],
      ["Help Center", "/help"],
      ["Workers", "/workers"],
      ["Find Work", "/jobs"]
    ]
  },
  {
    title: "Helpful Links",
    links: [
      ["Terms", "/legal/terms"],
      ["Privacy Policy", "/legal/privacy"],
      ["Cookie Policy", "/legal/cookies"],
      ["Community Guidelines", "/legal/community-guidelines"],
      ["Acceptable Use", "/legal/acceptable-use"]
    ]
  },
  {
    title: "Our Policies",
    links: [
      ["Content Policy", "/legal/content-policy"],
      ["Identity Verification", "/legal/identity-verification"],
      ["Payment & Refund", "/legal/payment-refunds"],
      ["Security", "/legal/security"],
      ["Responsible Disclosure", "/legal/responsible-disclosure"],
      ["Disclaimer", "/legal/disclaimer"]
    ]
  }
] as const;

export function LegalFooter() {
  const domain = configuredDomain() || "copic.local";
  const supportEmail = `support@${domain}`;
  const legalEmail = `legal@${domain}`;

  return (
    <footer className="copic-legal-footer" aria-label="Legal and support links">
      <div className="copic-legal-footer-inner">
        <div className="copic-legal-footer-brand-block">
          <Link href="/" className="copic-legal-footer-brand">COPIC</Link>
          <p>Flexible work by Blue Peak Technologies.</p>
        </div>

        {footerColumns.map(column => (
          <nav key={column.title} className="copic-legal-footer-column" aria-label={column.title}>
            <h2>{column.title}</h2>
            {column.links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
        ))}

        <div className="copic-legal-footer-contact" aria-label="Contact COPIC">
          <h2>Contact Us</h2>
          <a href={`mailto:${supportEmail}`}>
            <Mail size={15} aria-hidden="true" />
            {supportEmail}
          </a>
          <a href={`mailto:${legalEmail}`}>
            <Mail size={15} aria-hidden="true" />
            {legalEmail}
          </a>
          <div className="copic-footer-socials" aria-label="Social links">
            <span>f</span>
            <span>g</span>
            <span>x</span>
            <span>in</span>
          </div>
        </div>
      </div>
      <div className="copic-legal-footer-bottom">
        <p>&copy; 2026 COPIC by Blue Peak Technologies. All Rights reserved.</p>
        <div>
          <Link href="/legal/terms">Terms & Conditions</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/cookies">Cookies</Link>
        </div>
      </div>
    </footer>
  );
}
