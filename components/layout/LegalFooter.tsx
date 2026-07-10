import { configuredDomain } from "@/lib/production-env";
import Link from "next/link";

const legalLinks = [
  ["Terms", "/legal/terms"],
  ["Privacy", "/legal/privacy"],
  ["Cookies", "/legal/cookies"],
  ["Community Guidelines", "/legal/community-guidelines"],
  ["Acceptable Use", "/legal/acceptable-use"],
  ["Content Policy", "/legal/content-policy"],
  ["Identity Verification", "/legal/identity-verification"],
  ["Payment & Refund", "/legal/payment-refunds"],
  ["Security", "/legal/security"],
  ["Responsible Disclosure", "/legal/responsible-disclosure"],
  ["Disclaimer", "/legal/disclaimer"]
] as const;

export function LegalFooter() {
  const domain = configuredDomain() || "copic.local";
  const supportEmail = `support@${domain}`;
  const legalEmail = `legal@${domain}`;

  return (
    <footer className="copic-legal-footer" aria-label="Legal and support links">
      <div className="copic-legal-footer-inner">
        <p className="copic-legal-footer-brand">&copy; 2026 COPIC by Blue Peak Technologies.</p>
        <nav className="copic-legal-footer-links" aria-label="Legal policies">
          {legalLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="copic-legal-footer-contact">
          <div>
            <p>Need help?</p>
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </div>
          <div>
            <p>Legal:</p>
            <a href={`mailto:${legalEmail}`}>{legalEmail}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
