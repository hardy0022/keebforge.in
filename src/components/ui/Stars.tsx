export function Stars({ rating, size = "md" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "text-[0.78rem]" : "text-[1.1rem]";
  return (
    <span className={`${cls} inline-flex gap-0.5`} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= rating ? "text-[var(--acc)]" : "text-[var(--t3)]"}>
          {s <= rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}