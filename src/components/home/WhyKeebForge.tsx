import { Reveal } from "@/components/home/Reveal";

const WHY = [
  {
    num: "01",
    title: "Precision Work",
    desc: "Every build, modification, and repair handled with attention to the small details that affect feel, sound and reliability.",
  },
  {
    num: "02",
    title: "Built & Tuned For You",
    desc: "From switch lubing and stabilizer tuning to soldering, firmware and custom builds — tailored to how you actually use your setup.",
  },
  {
    num: "03",
    title: "Mail-In Service",
    desc: "Ship your keyboard or mouse from anywhere in India and get professional work done without a local specialist.",
  },
];

export function WhyKeebForge() {
  return (
    <section className="hp-why" aria-labelledby="why-keebforge">
      <header className="hp-section-head">
        <Reveal as="div">
          <p className="hp-kicker">
            <span className="hp-kicker-mark">{"//"}</span> Why KeebForge?
          </p>
        </Reveal>
      </header>

      <div className="hp-why-rows">
        {WHY.map((item, i) => (
          <Reveal as="article" className="hp-why-row" key={item.num} delay={i * 80}>
            <span className="hp-why-num" aria-hidden="true">
              {item.num}
            </span>
            <span className="hp-why-line" aria-hidden="true" />
            <div className="hp-why-body">
              <h3 className="hp-why-title">{item.title}</h3>
              <p className="hp-why-desc">{item.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}