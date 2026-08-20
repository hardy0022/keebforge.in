import type { FaqItem } from "@/lib/faq";
import { SectionHead } from "@/components/ui/SectionHead";

export function FaqList({ items, title, desc }: { items: FaqItem[]; title?: string; desc?: string }) {
  return (
    <section className="info-section" aria-labelledby="t-faq">
      <div className="wrap">
        {title && <SectionHead title={title} desc={desc} />}
        <div className="max-w-[720px] flex flex-col gap-3">
          {items.map((f, i) => (
            <details className="faq" key={i}>
              <summary>
                {f.q}
                <span className="faq-ico" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq-body">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}