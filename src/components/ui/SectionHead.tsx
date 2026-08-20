export function SectionHead({ num, title, desc }: { num?: string; title: string; desc?: string }) {
  return (
    <header className="sec-head">
      {num && <span className="sec-num">{num}</span>}
      <h2 className="sec-title">{title}</h2>
      {desc && <p className="sec-desc">{desc}</p>}
    </header>
  );
}