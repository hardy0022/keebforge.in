import Link from "next/link";
import { prisma } from "@/lib/prisma";

const SERVICES = [
  { href: "/services/keyboard", label: "Keyboard Services" },
  { href: "/services/mouse", label: "Mouse Services" },
  { href: "/repair/keyboard", label: "Keyboard Repair" },
  { href: "/repair/mouse", label: "Mouse Repair" },
  { href: "/services/keyboard/custom-keyboard-build", label: "Custom Builds" },
];

const COMPANY = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
];

const NAVIGATE = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/work", label: "Work" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/track", label: "Track Order" },
];

export async function SiteFooter() {
  const accepting = await prisma.siteSetting
    .findUnique({ where: { key: "acceptingOrders" } })
    .then((s) => s?.value !== false)
    .catch(() => true);

  return (
    <footer className="site-footer">
      <span className="footer-watermark" aria-hidden="true">
        KEEBFORGE
      </span>
      <div className="footer-main">
        <div>
          <div className="footer-brand-line">
            <span className="footer-brand-ico" aria-hidden="true">
              ⌨
            </span>
            <span>
              KeebForge<span className="logo-dot">.</span>in
            </span>
          </div>
          <p className="footer-blurb">
            Independent electronics workshop for custom keyboards. No middlemen, no markups — just precision switch,
            build, and repair work for the keeb community.
          </p>
          <span className="footer-status">
            <span className="footer-status-dot" />
            {accepting ? "Accepting Orders" : "Not Accepting Orders"}
          </span>
        </div>
        <div>
          <div className="footer-col-title">Services</div>
          <div className="footer-col-links">
            {SERVICES.map((l) => (
              <Link key={l.href} href={l.href}>
                _{l.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="footer-col-title">Company</div>
          <div className="footer-col-links">
            {COMPANY.map((l) => (
              <Link key={l.href} href={l.href}>
                _{l.label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="footer-col-title">Navigate</div>
          <div className="footer-col-links">
            {NAVIGATE.map((l) => (
              <Link key={l.href} href={l.href}>
                _{l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p className="footer-sys-line">
          © {new Date().getFullYear()} KEEBFORGE.in // ELECTRONICS ENGINEER // JAMMU &amp; KASHMIR // SYSTEM_END
        </p>
        <a
          href="https://portfolio.shadow269.in/"
          target="_blank"
          rel="noopener"
          className="footer-dev-credit"
        >
          Designed by <span className="dev-name">shadow269</span>
        </a>
      </div>
    </footer>
  );
}