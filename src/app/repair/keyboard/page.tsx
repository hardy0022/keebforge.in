import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { ServiceTable } from "@/components/services/ServiceTable";
import { Checklist } from "@/components/ui/Checklist";
import { FaqList } from "@/components/ui/FaqList";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { getServiceCatalog } from "@/lib/data";
import { formatServicePriceText } from "@/lib/orders";
import { buildKeyboardFaq, type PriceTextFn } from "@/lib/faq";

export const metadata: Metadata = buildMetadata({
  title: "Mechanical Keyboard Repair in India | KeebForge",
  description:
    "Mechanical keyboard repair across India — dead keys, rattling stabilizers, scratchy switches, hot-swap socket repair, PCB troubleshooting, soldering and custom builds. Mail-in from anywhere in India.",
  path: "/repair/keyboard",
});

const PROBLEMS = [
  { icon: "⌨️", title: "Dead or Non-Registering Keys", desc: "Switch failure, broken solder joint, damaged hot-swap socket, or a trace fault on the PCB — diagnosed and repaired at component level." },
  { icon: "✨", title: "Scratchy or Inconsistent Switches", desc: "Lubed switches feel smooth and consistent. Krytox 205g0 lubing, stem tuning and film installation restore a clean feel." },
  { icon: "🔊", title: "Rattling or Sticking Stabilizers", desc: "Spacebar and other large keys rattle when stabilizer wires are unbalanced or dry. Full stabilizer service fixes this." },
  { icon: "🔧", title: "Switch Replacement on Soldered Boards", desc: "Switches are desoldered without lifting pads, then new switches are soldered in with clean joints on every pin." },
  { icon: "🔬", title: "PCB Faults and Shorts", desc: "Trace shorts, component faults and microcontroller issues diagnosed with proper equipment — quoted after inspection." },
  { icon: "💾", title: "Firmware and Flashing Issues", desc: "QMK/ZMK firmware upload, keymap configuration and full key verification after flashing." },
];

const HOW_TO = [
  "Place an order on the order page and select the services you need.",
  "Confirm the details on Discord or email, including the exact work and quote.",
  "Ship your keyboard (or parts) to Jammu & Kashmir. The buyer covers shipping in both directions.",
  "KeebForge completes the work and sends optional work samples.",
  "Payment is confirmed before work begins — it books any parts needed and secures your order so work can start.",
];

export default async function KeyboardRepairPage() {
  const groups = await getServiceCatalog("KEYBOARD");
  const switchGroup = groups.find((g) => g.slug === "switch-services");
  const stabGroup = groups.find((g) => g.slug === "stabilizer-services");
  const buildGroup = groups.find((g) => g.slug === "build-soldering");

  const services = groups.flatMap((g) => g.services);
  const bySlug = new Map(services.map((s) => [s.slug, s]));
  const priceText: PriceTextFn = (slug) => formatServicePriceText(bySlug.get(slug) ?? null);
  const faqs = buildKeyboardFaq(priceText);

  return (
    <main>
      <PageHero
        tag="Keyboard Repair"
        title="Mechanical Keyboard Repair & Services"
        desc="Mechanical keyboards are built to last — but switches wear out, stabilizers rattle, sockets fail, and PCBs develop faults. KeebForge repairs, tunes and rebuilds mechanical keyboards from Jammu & Kashmir, accepting mail-in work from anywhere in India."
        pills={["Mail-in service across India", "Turnaround: 5–7 days", "Payment before work begins"]}
      />

      <section className="svc-section" aria-labelledby="t-problems">
        <div className="wrap">
          <SectionHead num="01 // Problems" title="What Keyboard Problems We Handle" />
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

      {switchGroup && <ServiceTable group={switchGroup} num="02 // Switches" />}
      {stabGroup && <ServiceTable group={stabGroup} num="03 // Stabilizers" />}

      <section className="svc-section" aria-labelledby="t-soldering">
        <div className="wrap">
          <SectionHead num="04 // Soldering" title="Soldering & Desoldering" />
          <div className="card max-w-[760px]">
            <p className="cd">
              Switch soldering costs {priceText("solder-switches")} with clean 60/40 joints on every pin, and
              desoldering costs {priceText("desolder-switches")} with gentle removal and no PCB pad damage. Complete
              keyboard builds start at {priceText("keyboard-build-60-65")} for a 60–65% board and{" "}
              {priceText("keyboard-build-tkl")} for a TKL.
            </p>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-sockets">
        <div className="wrap">
          <SectionHead num="05 // Sockets" title="Hot-Swap Socket Repair" />
          <div className="card max-w-[760px]">
            <p className="cd">
              Hot-swap sockets can come loose or lift off the PCB when switches are pulled. If keys are intermittent or
              dead on a hot-swap board, a socket replacement is usually the fix. Hot-swap socket install or replacement
              costs {priceText("hotswap-socket-install")}. To convert a soldered board to hot-swap, Mill-Max socket
              installation costs {priceText("millmax-socket-install")}.
            </p>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-pcb">
        <div className="wrap">
          <SectionHead num="06 // PCB" title="PCB Troubleshooting" />
          <div className="card max-w-[760px]">
            <p className="cd">
              When a keyboard behaves erratically — random key presses, rows or columns not registering, or a board that
              won&apos;t connect at all — the fault is usually on the PCB. KeebForge traces shorts, checks diodes, switch pads
              and solder joints, and repairs or replaces faulty components. This is quoted after inspection because the
              fault must be found before a price can be given.
            </p>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-builds">
        <div className="wrap">
          <SectionHead num="07 // Builds" title="Custom Keyboard Builds" />
          <div className="card max-w-[760px]">
            <p className="cd">
              Beyond repairs, KeebForge assembles complete custom mechanical keyboards — from a compact 60–65% build to a
              full TKL, including case, PCB, stabilizers, switches and keycaps. Split keyboards and fully bespoke
              layouts are quoted individually.
            </p>
          </div>
        </div>
      </section>

      {buildGroup && <ServiceTable group={buildGroup} num="08 // Build & Soldering" />}

      <section className="svc-section" aria-labelledby="t-firmware">
        <div className="wrap">
          <SectionHead num="09 // Firmware" title="Firmware Services" />
          <div className="card max-w-[760px]">
            <p className="cd">
              Firmware upload and testing covers QMK and ZMK flashing, keymap configuration and full key verification —
              useful after repairs, PCB work, or when a board needs a custom layout.
            </p>
          </div>
        </div>
      </section>

      <Checklist items={HOW_TO} title="How to Send Your Keyboard for Service" />
      <FaqList items={faqs} title="Keyboard Repair Questions" />
      <CtaSection
        title={
          <>
            Place a Keyboard
            <br />
            Repair Order
          </>
        }
        desc="Describe the issue when you order — fixed-price work is billed at the listed rates and anything condition-dependent is quoted before you pay."
      />
    </main>
  );
}