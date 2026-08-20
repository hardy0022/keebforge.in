"use client";

import { SectionHead } from "@/components/ui/SectionHead";

export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <section className="svc-section">
        <div className="wrap">
          <SectionHead title="Something went wrong" />
          <div className="card qcard p-10 text-center">
            <p className="cd mb-4">The shop could not be loaded right now.</p>
            <button type="button" className="btn-ghost" onClick={reset} style={{ width: "auto", paddingInline: 24 }}>
              Try again
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}