import type { NextConfig } from "next";

const REDIRECTS: { source: string; destination: string; permanent: boolean }[] = [
  // IA rename (2026-08-24): /services → /mods, /repair → /workshop.
  { source: "/services", destination: "/mods", permanent: false },
  { source: "/repair", destination: "/workshop", permanent: false },
  // Auth pages moved under /auth/* (old paths kept working via redirects).
  { source: "/login", destination: "/auth/login", permanent: false },
  { source: "/register", destination: "/auth/register", permanent: false },
  { source: "/forgot-password", destination: "/auth/forgot-password", permanent: false },
  // Old static site → new routes
  { source: "/keyboard-repair", destination: "/repair", permanent: true },
  { source: "/mouse-repair", destination: "/repair", permanent: true },
  { source: "/pricing", destination: "/services", permanent: true },
  { source: "/order", destination: "/checkout", permanent: true },
  { source: "/Terms&Conditions", destination: "/terms", permanent: true },
  // Old service slugs → /services (D-022: per-service detail pages removed).
  { source: "/keyboard-services/switch-lubing", destination: "/services", permanent: true },
  { source: "/keyboard-services/switch-filming", destination: "/services", permanent: true },
  { source: "/keyboard-services/stabilizer-tuning", destination: "/services", permanent: true },
  { source: "/keyboard-services/soldering", destination: "/services", permanent: true },
  { source: "/keyboard-services/desoldering", destination: "/services", permanent: true },
  { source: "/keyboard-services/millmax-installation", destination: "/services", permanent: true },
  { source: "/keyboard-services/hotswap-socket-repair", destination: "/services", permanent: true },
  { source: "/keyboard-services/pcb-repair", destination: "/services", permanent: true },
  { source: "/keyboard-services/firmware", destination: "/services", permanent: true },
  { source: "/keyboard-services/custom-keyboard-build", destination: "/services", permanent: true },
  { source: "/mouse-services/mouse-switch-replacement", destination: "/services", permanent: true },
  { source: "/mouse-services/mouse-encoder-replacement", destination: "/services", permanent: true },
  { source: "/mouse-services/mouse-diagnostics", destination: "/services", permanent: true },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  // Repair inquiry photos can be up to 5 MB each (max 5) — the default 1 MB
  // server-action body limit would reject them.
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
  },
  // @better-auth/infra dynamic-imports @better-auth/sso for SAML SSO, which we
  // don't use; externalize so Next doesn't try to bundle a missing module.
  serverExternalPackages: ["@better-auth/sso"],
  images: {
    // Cloudinary hosts all application-uploaded imagery; local /public stays
    // for logo/favicon/branding. next/image still optimizes and lazy-loads.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  async headers() {
    return [
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://dash.better-auth.com" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
  async redirects() {
    return REDIRECTS;
  },
};

export default nextConfig;