import { SectionHead } from "@/components/ui/SectionHead";

export function Checklist({ items, title = "How to Send It In" }: { items: string[]; title?: string }) {
  return (
    <section className="info-section" aria-labelledby="howto-title">
      <div className="wrap">
        <SectionHead title={title} desc="Everything the mail-in process involves, step by step." />
        <ol className="max-w-[720px] flex flex-col gap-3">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex gap-4 items-start bg-[var(--bg1)] border border-[var(--bdr)] rounded-[var(--r-sm)] p-4"
            >
              <span className="font-display font-bold text-[var(--acc)] text-sm mt-0.5 flex-shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[0.85rem] text-[var(--t2)] leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}