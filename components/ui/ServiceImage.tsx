"use client";
import { useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

/** Reserve the image's space and retain a usable card when an upload cannot load. */
export function ServiceImage({ src, alt = "Service photo", className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<ImgHTMLAttributes<HTMLImageElement>["src"]>();
  if (!src || failedSource === src) return <div role="img" aria-label={`${alt}: photo unavailable`} className={`copic-image-fallback ${className ?? ""}`}><ImageOff size={24} aria-hidden="true" /><span>Photo unavailable</span></div>;
  // Authenticated blob previews and server image routes use the existing upload URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={600} height={450} loading="lazy" decoding="async" className={className} onError={() => setFailedSource(src)} {...props} />;
}
