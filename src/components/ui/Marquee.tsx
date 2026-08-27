/**
 * Seamless full-width ticker. Two identical groups sit side by side and the
 * track translates exactly one group's width (translateX(-50%)), so the loop
 * point is invisible. All spacing lives INSIDE each group (star margins, not
 * flex gap) so both halves measure identically at every viewport width.
 */
function MarqueeGroup({ items }: { items: string[] }) {
  return (
    <div className="marquee-group">
      {items.map((item) => (
        <span className="marquee-item" key={item}>
          {item}
          <span className="marquee-star" aria-hidden="true">
            ✦
          </span>
        </span>
      ))}
    </div>
  );
}

export function Marquee({ items }: { items: string[] }) {
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        <MarqueeGroup items={items} />
        <MarqueeGroup items={items} />
      </div>
    </div>
  );
}
