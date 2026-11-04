"use client";

import { useId, useState } from "react";
import type { FaqItem } from "@/lib/faq";

type FaqCategoryProps = {
  id: string;
  index: number;
  title: string;
  items: FaqItem[];
};

export function FaqCategory({ id, index, title, items }: FaqCategoryProps) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  const baseId = useId().replace(/:/g, "");
  const headingId = `${baseId}-${id}-title`;
  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)];

  function toggle(index: number) {
    setOpenItems((current) => {
      const next = new Set(current);

      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }

      return next;
    });
  }

  return (
    <section className="faq-category" aria-labelledby={headingId}>
      <header className="faq-category-head">
        <span className="faq-category-num">
          {String(index).padStart(2, "0")} /
        </span>
        <h2 className="faq-category-title" id={headingId}>
          {title}
        </h2>
        <span className="faq-category-rule" aria-hidden="true" />
      </header>

      <div className="faq-category-grid">
        {columns.map((column, columnIndex) => (
          <div className="faq-column" key={columnIndex}>
            {column.map((item, itemIndex) => {
              const itemNumber =
                columnIndex === 0 ? itemIndex : half + itemIndex;
              const isOpen = openItems.has(itemNumber);
              const buttonId = `${baseId}-${id}-q-${itemNumber}`;
              const panelId = `${baseId}-${id}-a-${itemNumber}`;

              return (
                <article
                  className={`faq-item${isOpen ? " is-open" : ""}`}
                  key={item.q}
                >
                  <button
                    type="button"
                    className="faq-question"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(itemNumber)}
                  >
                    <span className="faq-question-text">{item.q}</span>
                    <span className="faq-icon" aria-hidden="true">
                      +
                    </span>
                  </button>

                  <div
                    id={panelId}
                    className="faq-panel"
                    aria-hidden={!isOpen}
                    inert={!isOpen}
                  >
                    <div className="faq-panel-inner">
                      <div className="faq-answer">{item.a}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
