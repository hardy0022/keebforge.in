import Link from "next/link";
import type { Service, ServiceGroup } from "@prisma/client";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { SectionHead } from "@/components/ui/SectionHead";

function href(svc: Service) {
  return `/services/${svc.device === "MOUSE" ? "mouse" : "keyboard"}/${svc.slug}`;
}

export function ServiceTable({
  group,
  num,
  showLinks = true,
}: {
  group: ServiceGroup & { services: Service[] };
  num?: string;
  showLinks?: boolean;
}) {
  return (
    <section className="svc-section" aria-labelledby={`t-${group.slug}`}>
      <div className="wrap">
        <SectionHead num={num} title={group.name} />
        <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--bdr)] bg-[var(--bg1)]">
          <table className="w-full text-left text-[0.85rem] min-w-[560px]">
            <thead>
              <tr className="border-b border-[var(--bdr)] text-[0.62rem] uppercase tracking-[0.12em] text-[var(--t3)]">
                <th className="px-5 py-3.5 font-bold">Service</th>
                <th className="px-5 py-3.5 font-bold text-right">Price</th>
                <th className="px-5 py-3.5 font-bold text-right">Unit</th>
                {showLinks && <th className="px-5 py-3.5 w-10" aria-label="Details" />}
              </tr>
            </thead>
            <tbody>
              {group.services.map((svc) => (
                <tr key={svc.id} className="border-b border-[var(--bdr)] last:border-0 hover:bg-[var(--bg2)] transition-colors">
                  <td className="px-5 py-3.5 text-[var(--t1)]">
                    {svc.name}
                    {svc.combo && (
                      <span className="ml-2 text-[0.58rem] font-bold uppercase tracking-wider text-[var(--acc)] bg-[var(--acc-dim)] border border-[var(--bdr)] rounded-full px-2 py-0.5">
                        Combo
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-display font-bold text-[var(--acc)] whitespace-nowrap">
                    <PriceDisplay price={svc.price} priceMin={svc.priceMin} priceMax={svc.priceMax} unit={svc.unit} priceLabel={svc.priceLabel} />
                  </td>
                  <td className="px-5 py-3.5 text-right text-[var(--t3)] whitespace-nowrap">
                    {svc.unit === "FLAT" ? "flat" : svc.unit === "QUOTE" ? "after inspection" : svc.priceLabel ? "" : svc.unit === "PER_STABILIZER" ? "stabilizer" : "switch"}
                  </td>
                  {showLinks && (
                    <td className="px-5 py-3.5 text-right">
                      <Link href={href(svc)} className="text-[var(--acc)] hover:underline text-sm" aria-label={`${svc.name} details`}>
                        →
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}