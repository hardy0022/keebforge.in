const LINES = ["BUILT FOR", "KEYBOARDS,", "MICE & ELECTRONICS."] as const;

/** Standalone full-width homepage statement. Static — always fully visible, no scroll effects. */
export function ScrollStatement() {
  return (
    <section className="hp-statement" aria-label="What we build for">
      <p className="hp-statement-kicker">What we build for</p>
      <div className="hp-statement-lines">
        {LINES.map((line) => (
          <h2 className="hp-statement-line" key={line}>
            {line}
          </h2>
        ))}
      </div>
    </section>
  );
}