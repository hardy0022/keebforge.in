import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({ title: "Thanks | KeebForge", description: "Your message is on its way.", path: "/thanks", noIndex: true });

export default function ThanksPage() {
  return (
    <main className="pt-[calc(var(--nav-h)+80px)] pb-24">
      <div className="wrap text-center">
        <div className="cta-wrap mx-auto">
          <span className="cta-tag">Message Received</span>
          <h1 className="cta-title">Thanks for reaching out.</h1>
          <p className="cta-desc">
            Your repair inquiry is on its way to the workshop. KeebForge usually replies within a day — check your
            inbox (and spam) for a response from contact@keebforge.in.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <Link href="/" className="btn-prime btn-prime-lg">
              Back to Home
            </Link>
            <Link href="/checkout" className="btn-ghost">
              Place an Order
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}