import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

/* Central social config — update handles here only.
   Reddit/Discord/Instagram mirror the owner's real profiles (see /about);
   YouTube handle is a placeholder until the channel is live. */
const SOCIALS = [
  { label: "Reddit", href: "https://www.reddit.com/user/hardy_022/" },
  { label: "Discord", href: "https://discord.com/users/843113968734437376" },
  { label: "Instagram", href: "https://www.instagram.com/nowitshardik/" },
  { label: "YouTube", href: "https://www.youtube.com/@keebforge" },
  { label: "GitHub", href: "https://github.com/hardy0022" },
] as const;

/* No icon package is installed (and Lucide ships no Reddit/Discord brands),
   so the five marks are inline SVGs on the standard 24×24 brand grid. */
const SOCIAL_ICONS: Record<(typeof SOCIALS)[number]["label"], ReactNode> = {
  Reddit: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 00.029-.463.33.33 0 00-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 00-.232-.095z" />
    </svg>
  ),
  Discord: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.009c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  ),
  Instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="2.4" y="2.4" width="19.2" height="19.2" rx="5.2" />
      <circle cx="12" cy="12" r="4.35" />
      <circle cx="17.35" cy="6.65" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  ),
  YouTube: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.121 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  GitHub: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  ),
};

/* Only routes that actually exist — no invented URLs. */
const NAVIGATE = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/shop/custom", label: "Made to Order" },
  { href: "/shop/products", label: "Brand New" },
  { href: "/shop/clearance", label: "Clearance" },
  { href: "/mods", label: "Mods" },
  { href: "/workshop", label: "Workshop" },
  { href: "/work", label: "Work" },
];

const COMPANY = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms & Conditions" },
];

/* Routes without pages yet render as non-links tagged SOON — never dead hrefs. */
const SUPPORT = [
  { label: "Track Order" },
  { label: "Shipping Information" },
  { label: "Returns & Refunds" },
  { href: "/contact", label: "Contact" },
  { href: "/write-review", label: "Write a Review" },
];

function SocialButton({ label }: { label: (typeof SOCIALS)[number]["label"] }) {
  const s = SOCIALS.find((x) => x.label === label)!;
  return (
    <a
      className="follow-btn"
      href={s.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`KeebForge on ${s.label}`}
    >
      {SOCIAL_ICONS[label]}
    </a>
  );
}

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
        <div className="footer-brand-col">
          <div className="footer-brand-line">
            <span className="footer-brand-ico" aria-hidden="true">
              ⌨
            </span>
            <span>
              KeebForge<span className="logo-dot">.</span>in
            </span>
          </div>
          <p className="footer-blurb">
            Independent electronics workshop for custom keyboards, mechanical keyboard builds, tuning, modifications,
            repairs, and keyboard accessories.
          </p>
          <span className="footer-status">
            <span className="footer-status-dot" data-off={!accepting || undefined} />
            {accepting ? "Accepting Orders" : "Not Accepting Orders"}
          </span>
          <div className="footer-follow">
            <span className="footer-follow-label">Follow KeebForge</span>
            <div className="footer-follow-row">
              {SOCIALS.map((s) => (
                <SocialButton key={s.label} label={s.label} />
              ))}
            </div>
          </div>
        </div>

        <nav aria-label="Navigate">
          <div className="footer-col-title">Navigate</div>
          <div className="footer-col-links">
            {NAVIGATE.map((l) => (
              <Link key={l.label} href={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        </nav>

        <nav aria-label="Company">
          <div className="footer-col-title">Company</div>
          <div className="footer-col-links">
            {COMPANY.map((l) => (
              <Link key={l.label} href={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        </nav>

        <nav aria-label="Support">
          <div className="footer-col-title">Support</div>
          <div className="footer-col-links">
            {SUPPORT.map((l) =>
              l.href ? (
                <Link key={l.label} href={l.href}>
                  {l.label}
                </Link>
              ) : (
                <span key={l.label} className="footer-link-soon" title="Coming soon">
                  {l.label}
                  <em>Soon</em>
                </span>
              )
            )}
          </div>
        </nav>
      </div>

      <div className="footer-bottom">
        <p className="footer-sys-line">
          © {new Date().getFullYear()} KeebForge.in · Electronics Engineer · Jammu &amp; Kashmir · India
        </p>
        <a href="https://portfolio.shadow269.in/" target="_blank" rel="noopener noreferrer" className="footer-dev-credit">
          Designed by <span className="dev-name">shadow269</span>
        </a>
      </div>
    </footer>
  );
}
