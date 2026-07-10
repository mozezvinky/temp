import { legalPolicies, legalPolicyMap } from "@/lib/legal-content";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return legalPolicies.map(policy => ({ slug: policy.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = legalPolicyMap.get(slug);
  return { title: policy ? `${policy.title} | Copic` : "Legal | Copic" };
}

export default async function LegalPolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = legalPolicyMap.get(slug);
  if (!policy) notFound();

  return (
    <article className="copic-legal-page">
      <header>
        <Link href="/" className="copic-legal-back">Back to Copic</Link>
        <div>
          <p className="copic-legal-eyebrow">COPIC Legal</p>
          <h1>{policy.title}</h1>
          <p>Source: {policy.source}</p>
        </div>
      </header>
      <div className="copic-legal-body">
        {policy.paragraphs.map((paragraph, index) => isHeading(paragraph, index) ? (
          <h2 key={`${paragraph}-${index}`}>{paragraph}</h2>
        ) : (
          <p key={`${paragraph}-${index}`}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}

function isHeading(paragraph: string, index: number) {
  if (index === 0) return false;
  if (paragraph.length > 90) return false;
  return /^(section|article|\d+\.|[A-Z][A-Za-z ]+:?$)/.test(paragraph) || paragraph === paragraph.toUpperCase();
}
