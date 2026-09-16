import type { NextConfig } from "next";

const REDIRECTS: { source: string; destination: string; permanent: boolean }[] =
  [
    // IA rename (2026-08-24): /services → /mods, /repair → /workshop.
    { source: "/services", destination: "/mods", permanent: true },
    { source: "/repair", destination: "/workshop", permanent: true },
    // Auth pages moved under /auth/* (old paths kept working via redirects).
    { source: "/login", destination: "/auth/login", permanent: false },
    { source: "/register", destination: "/auth/register", permanent: false },
    {
      source: "/forgot-password",
      destination: "/auth/forgot-password",
      permanent: false,
    },
    // Short/legacy URLs → canonical (single hop).
    { source: "/cart", destination: "/shop/cart", permanent: false },
    { source: "/checkout", destination: "/shop/checkout", permanent: false },
    { source: "/profile", destination: "/account/profile", permanent: false },
    {
      source: "/account/addresses",
      destination: "/account/profile",
      permanent: false,
    },
    // Old static site → new routes (flattened, no intermediate hops).
    { source: "/keyboard-repair", destination: "/workshop", permanent: true },
    { source: "/mouse-repair", destination: "/workshop", permanent: true },
    { source: "/pricing", destination: "/mods", permanent: true },
    { source: "/order", destination: "/shop/checkout", permanent: true },
    { source: "/Terms&Conditions", destination: "/terms", permanent: true },
    // Old service slugs → /mods (D-022: per-service detail pages removed).
    {
      source: "/keyboard-services/switch-lubing",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/switch-filming",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/stabilizer-tuning",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/soldering",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/desoldering",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/millmax-installation",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/hotswap-socket-repair",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/pcb-repair",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/firmware",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/keyboard-services/custom-keyboard-build",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/mouse-services/mouse-switch-replacement",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/mouse-services/mouse-encoder-replacement",
      destination: "/mods",
      permanent: true,
    },
    {
      source: "/mouse-services/mouse-diagnostics",
      destination: "/mods",
      permanent: true,
    },
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
    // Cloudinary transforms + caches every application-uploaded image and
    // delivers it straight to the browser (custom loader, see
    // src/lib/images/loader.ts) — Vercel no longer re-fetches those bytes.
    // Local /public assets are pre-optimized and served as-is.
    loader: "custom",
    loaderFile: "./src/lib/images/loader.ts",
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  async headers() {
    return [
      {
        source: "/api/auth/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "https://dash.better-auth.com",
          },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Authorization, Content-Type",
          },
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
