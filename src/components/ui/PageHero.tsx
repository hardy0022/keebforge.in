export function PageHero({
  tag,
  title,
  desc,
  pills,
}: {
  tag: string;
  title: string;
  desc: string;
  pills?: string[];
}) {
  return (
    <section className="pt-[calc(var(--nav-h)+48px)] pb-10">
      <div className="wrap">
        <span className="sec-num">{tag}</span>
        <h1 className="sec-title">{title}</h1>
        <p className="sec-desc" style={{ maxWidth: 640, fontSize: "0.95rem" }}>
          {desc}
        </p>
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-5">
            {pills.map((p) => (
              <span
                key={p}
                className="text-[0.62rem] font-bold tracking-[0.1em] uppercase text-[var(--t2)] border border-[var(--bdr)] rounded-full px-4 py-1.5 bg-[var(--bg1)]"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}