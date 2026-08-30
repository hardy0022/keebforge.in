const SERVICES = [
  "Custom Builds",
  "PCB Design",
  "Soldering",
  "Stabilizer Tuning",
  "Firmware",
  "Electronics Repair",
  "Switch Lubing",
];

// One list, repeated N times so one duplicate's width always exceeds the viewport.
const COPIES = 4;

export function ServicesTicker() {
  return (
    <section
      className="home-ticker"
      aria-label="Services"
      style={{ "--ticker-copies": COPIES } as React.CSSProperties}
    >
      <div className="home-ticker-track">
        {Array.from({ length: COPIES }, (_, k) => (
          <span className="home-ticker-seg" key={k} aria-hidden={k > 0}>
            {SERVICES.map((service) => (
              <span className="home-ticker-item" key={service}>
                {service}
                <span className="home-ticker-dot" aria-hidden="true">
                  ·
                </span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </section>
  );
}