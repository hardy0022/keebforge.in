import type { NextConfig } from "next";

const REDIRECTS: { source: string; destination: string; permanent: boolean }[] = [
  // Old static site → new routes
  { source: "/keyboard-repair", destination: "/repair/keyboard", permanent: true },
  { source: "/mouse-repair", destination: "/repair/mouse", permanent: true },
  { source: "/pricing", destination: "/services", permanent: true },
  { source: "/order", destination: "/checkout", permanent: true },
  { source: "/Terms&Conditions", destination: "/terms", permanent: true },
  // Old service slugs → new canonical slugs (verified against DB). Next.js
  // redirects don't chain, so each old URL must point straight at its final
  // destination.
  { source: "/keyboard-services/switch-lubing", destination: "/services/keyboard/krytox-205g0-lubing", permanent: true },
  { source: "/keyboard-services/switch-filming", destination: "/services/keyboard/durock-films", permanent: true },
  { source: "/keyboard-services/stabilizer-tuning", destination: "/services/keyboard/full-stabilizer-service", permanent: true },
  { source: "/keyboard-services/soldering", destination: "/services/keyboard/solder-switches", permanent: true },
  { source: "/keyboard-services/desoldering", destination: "/services/keyboard/desolder-switches", permanent: true },
  { source: "/keyboard-services/millmax-installation", destination: "/services/keyboard/millmax-socket-install", permanent: true },
  { source: "/keyboard-services/hotswap-socket-repair", destination: "/services/keyboard/hotswap-socket-install", permanent: true },
  { source: "/keyboard-services/pcb-repair", destination: "/services/keyboard/pcb-troubleshooting-repair", permanent: true },
  { source: "/keyboard-services/firmware", destination: "/services/keyboard/firmware-upload-testing", permanent: true },
  { source: "/keyboard-services/custom-keyboard-build", destination: "/services/keyboard/full-custom-keyboard-build", permanent: true },
  { source: "/mouse-services/mouse-switch-replacement", destination: "/services/mouse/switch-swap", permanent: true },
  { source: "/mouse-services/mouse-encoder-replacement", destination: "/services/mouse/encoder-replacement", permanent: true },
  { source: "/mouse-services/mouse-diagnostics", destination: "/services/mouse/mouse-diagnostics-repair", permanent: true },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  // @better-auth/infra dynamic-imports @better-auth/sso for SAML SSO, which we
  // don't use; externalize so Next doesn't try to bundle a missing module.
  serverExternalPackages: ["@better-auth/sso"],
  async redirects() {
    return REDIRECTS;
  },
};

export default nextConfig;