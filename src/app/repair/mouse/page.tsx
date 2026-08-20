import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { ServiceTable } from "@/components/services/ServiceTable";
import { Checklist } from "@/components/ui/Checklist";
import { FaqList } from "@/components/ui/FaqList";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { getServiceCatalog } from "@/lib/data";
import { MOUSE_FAQ } from "@/lib/faq";

export const metadata: Metadata = buildMetadata({
  title: "Gaming Mouse Repair in India | KeebForge",
  description:
    "Gaming mouse repair across India — double-clicking switches, scroll wheel encoder replacement, skate replacement, tape mod and diagnostics. Mail-in from anywhere in India.",
  path: "/repair/mouse",
});

const PROBLEMS = [
  { icon: "🖱️", title: "Double-Clicking Switches", desc: "Worn main switches register double clicks. Replaced on the left and right buttons." },
  { icon: "🎡", title: "Skipping or Dead Scroll Wheel", desc: "A failing encoder causes inconsistent, reversed or dead scrolling. Replaced to match your model." },
  { icon: "🔘", title: "Mushy or Dead Side / Middle Buttons", desc: "Forward, back, DPI and scroll-click switches wear out and get replaced." },
  { icon: "🛼", title: "Worn Out Mouse Feet", desc: "Old PTFE skates drag and scratch. Replaced and leveled for smooth glide." },
  { icon: "🩺", title: "Cable, Sensor or Connectivity Issues", desc: "General diagnostics for buttons, sensor, cable and connectivity problems — quoted after inspection." },
  { icon: "🎵", title: "Hollow or Rattly Shell", desc: "Tape mod reduces shell flex, rattle and hollow acoustics." },
];

const HOW_TO = [
  "Place an order on the order page and select the mouse services you need.",
  "Confirm the details on Discord or email, including the exact work and quote.",
  "Confirm payment before work begins — this secures the order and covers any parts needed.",
  "Ship your mouse to Jammu & Kashmir. The buyer covers shipping in both directions.",
  "KeebForge completes the work, sends optional work samples, and ships the repaired mouse back.",
];

export default async function MouseRepairPage() {
  const groups = await getServiceCatalog("MOUSE");

  return (
    <main>
      <PageHero
        tag="Mouse Repair"
        title="Gaming Mouse Repair & Services"
        desc="Gaming mice wear out in predictable ways: switches start double-clicking, scroll wheels skip or die, and feet lose their glide. KeebForge replaces switches, encoders and skates, and repairs cable, sensor and connectivity faults — by mail, from anywhere in India."
        pills={["Mail-in service across India", "Turnaround: 5–7 days", "Payment before work begins"]}
      />

      <section className="svc-section" aria-labelledby="t-problems">
        <div className="wrap">
          <SectionHead num="01 // Problems" title="What Mouse Problems We Fix" />
          <div className="cards-wide">
            {PROBLEMS.map((p) => (
              <article className="card" key={p.title}>
                <div className="ch">
                  <span className="ci" aria-hidden="true">{p.icon}</span>
                </div>
                <h3 className="ct">{p.title}</h3>
                <p className="cd">{p.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-switches">
        <div className="wrap">
          <SectionHead num="02 // Switches" title="Mouse Switch Replacement" />
          <div className="card max-w-[760px]">
            <p className="cd">
              The most common mouse repair in India is a <strong style={{ color: "var(--t1)" }}>double-clicking switch</strong>. Over
              time the microswitch contacts in the left or right click button wear out and register two clicks for one
              press. The fix is a clean switch swap — the worn switch is desoldered and replaced.
            </p>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-encoder">
        <div className="wrap">
          <SectionHead num="03 // Encoder" title="Encoder Replacement (Scroll Wheel)" />
          <div className="card max-w-[760px]">
            <p className="cd">
              If your scroll wheel skips steps, scrolls the wrong direction, or does nothing at all, the rotary encoder
              is usually the culprit. KeebForge replaces the encoder with one <strong style={{ color: "var(--t1)" }}>sourced to
              match your mouse model</strong>.
            </p>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-mods">
        <div className="wrap">
          <SectionHead num="04 // Mods" title="Mouse Mods" />
          <div className="card max-w-[760px]">
            <p className="cd">
              Beyond repairs, KeebForge also does quality-of-life mods: <strong style={{ color: "var(--t1)" }}>skate / feet
              replacement</strong> with fresh PTFE, and the <strong style={{ color: "var(--t1)" }}>tape mod</strong> to reduce shell
              flex, rattle and hollow acoustics.
            </p>
          </div>
        </div>
      </section>

      {groups.map((g, i) => (
        <ServiceTable key={g.id} group={g} num={`0${i + 5} // Mouse`} />
      ))}

      <section className="svc-section" aria-labelledby="t-pricing">
        <div className="wrap">
          <SectionHead num="Pricing" title="Pricing & Quote Process" />
          <div className="card max-w-[760px]">
            <p className="cd">
              Mouse work is <strong style={{ color: "var(--t1)" }}>quoted after inspection</strong> — the mouse is assessed and a
              price confirmed before work starts. Payment is confirmed before work begins, and the buyer covers shipping
              in both directions.
            </p>
          </div>
        </div>
      </section>

      <Checklist items={HOW_TO} title="How to Send Your Mouse for Service" />
      <FaqList items={MOUSE_FAQ} title="Mouse Repair Questions" />
      <CtaSection
        title={
          <>
            Place Your
            <br />
            Order Today
          </>
        }
        desc="Describe the mouse issue when you order — the device is assessed and a quote confirmed before anything starts."
      />
    </main>
  );
}