import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { SectionHead } from "@/components/ui/SectionHead";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { getServiceBySlug, getServiceCatalog } from "@/lib/data";

const DEVICE_NAME = { keyboard: "Keyboard", mouse: "Mouse" } as const;

export async function generateMetadata({ params }: { params: Promise<{ device: string; slug: string }> }): Promise<Metadata> {
  const { device, slug } = await params;
  if (device !== "keyboard" && device !== "mouse") return buildMetadata({ title: "Service not found | KeebForge", description: "", path: "/services", noIndex: true });
  const svc = await getServiceBySlug(device === "keyboard" ? "KEYBOARD" : "MOUSE", slug);
  if (!svc) return buildMetadata({ title: "Service not found | KeebForge", description: "", path: "/services", noIndex: true });
  return buildMetadata({
    title: `${svc.name} | KeebForge`,
    description: svc.description ?? `${svc.name} — precision ${DEVICE_NAME[device].toLowerCase()} service by KeebForge, mail-in across India.`,
    path: `/services/${device}/${svc.slug}`,
  });
}

const STEPS = [
  { icon: "🛒", title: "Place an Order", desc: "Select this service on the order page and describe your device and any details that matter." },
  { icon: "💬", title: "Confirm the Details", desc: "The exact work and any quote are confirmed on Discord or email before anything starts." },
  { icon: "📦", title: "Ship It In", desc: "Pack your keyboard, mouse, or parts carefully and ship to Jammu & Kashmir. The buyer covers shipping both ways." },
  { icon: "🔧", title: "Work Is Completed", desc: "The service is performed and tested, with optional work samples shared as it progresses." },
  { icon: "🚚", title: "Shipped Back", desc: "Your finished device is securely shipped back to you anywhere in India." },
];

export default async function ServiceDetailPage({ params }: { params: Promise<{ device: string; slug: string }> }) {
  const { device, slug } = await params;
  if (device !== "keyboard" && device !== "mouse") notFound();
  const svc = await getServiceBySlug(device === "keyboard" ? "KEYBOARD" : "MOUSE", slug);
  if (!svc) notFound();

  const groupServices = await getServiceCatalog(device === "keyboard" ? "KEYBOARD" : "MOUSE");
  const group = groupServices.find((g) => g.id === svc.groupId);
  const related = (group?.services ?? []).filter((s) => s.id !== svc.id);
  const unitLabel =
    svc.unit === "FLAT" ? "Flat price" : svc.unit === "QUOTE" ? "After inspection" : svc.priceLabel ?? (svc.unit === "PER_STABILIZER" ? "per stabilizer" : "per switch");

  return (
    <main>
      <section className="pt-[calc(var(--nav-h)+40px)] pb-8">
        <div className="wrap">
          <Breadcrumbs
            items={[
              { name: "Services", href: "/services" },
              { name: `${DEVICE_NAME[device]} Services`, href: "/services" },
              { name: svc.name },
            ]}
          />
        </div>
      </section>

      <section className="pb-8">
        <div className="wrap">
          <article className="card card-feat">
            <div className="feat-badge">{svc.popular ? "★ Most Popular" : svc.combo ? "Combo" : "Available"}</div>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-[560px]">
                <h1 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] font-bold leading-tight tracking-[-0.02em] text-[var(--t1)]">
                  {svc.name}
                </h1>
                <p className="mt-3 text-[0.9rem] leading-relaxed text-[var(--t2)]">{svc.description}</p>
              </div>
              <div className="text-left md:text-right">
                <PriceDisplay price={svc.price} priceMin={svc.priceMin} priceMax={svc.priceMax} unit={svc.unit} priceLabel={svc.priceLabel} large />
                <span className="block text-[0.62rem] uppercase tracking-[0.08em] text-[var(--t3)] mt-1">{unitLabel}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link href="/checkout" className="btn-feat" style={{ width: "auto", paddingInline: 28 }}>
                Order This Service
              </Link>
              <Link href="/contact" className="btn-ghost">
                Ask a Question
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="svc-section">
        <div className="wrap">
          <SectionHead num="How It Works" title="Ordering This Service" desc="The same mail-in flow applies to every service — fixed-price or quoted." />
          <div className="info-grid">
            {STEPS.map((s) => (
              <article className="info-card" key={s.title}>
                <span className="info-ico" aria-hidden="true">{s.icon}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="svc-section" aria-labelledby="t-related">
          <div className="wrap">
            <SectionHead title="Related Services" desc={group?.name ? `More work in ${group.name}.` : "More keyboard services."} />
            <div className="cards">
              {related.map((s) => (
                <Link key={s.id} href={`/services/${device}/${s.slug}`} className="card card-q">
                  <div className="ch">
                    <span className="ci" aria-hidden="true">⚙️</span>
                    <div className="cp">
                      <PriceDisplay price={s.price} priceMin={s.priceMin} priceMax={s.priceMax} unit={s.unit} priceLabel={s.priceLabel} />
                    </div>
                  </div>
                  <h3 className="ct">{s.name}</h3>
                  <p className="cd">{s.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaSection
        title={
          <>
            Ready to Get
            <br />
            It Done?
          </>
        }
        desc="Order the service or message on Discord — quotes for inspection-based work are confirmed before you pay anything."
      />
    </main>
  );
}