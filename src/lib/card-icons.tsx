import type { ReactNode } from "react";

export type CardIconName =
  | "keyboard"
  | "mouse"
  | "switch"
  | "layers"
  | "box"
  | "cable"
  | "battery"
  | "cpu"
  | "zap"
  | "scale"
  | "droplet"
  | "shield";

type CardIconDef = { label: string; path: ReactNode };

export const CARD_ICONS: Record<CardIconName, CardIconDef> = {
  keyboard: { label: "Keyboard", path: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" /></> },
  mouse: { label: "Mouse", path: <><rect x="6" y="3" width="12" height="18" rx="6" /><path d="M12 7v4" /></> },
  switch: { label: "Switch", path: <><rect x="3" y="9" width="18" height="6" rx="3" /><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" /></> },
  layers: { label: "Layers", path: <><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 12 10 5 10-5" /><path d="m2 17 10 5 10-5" /></> },
  box: { label: "Material", path: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></> },
  cable: { label: "Connection", path: <><path d="M9 7V3M15 7V3" /><path d="M7 7h10l-1 5a4 4 0 0 1-8 0L7 7Z" /><path d="M12 16v5" /></> },
  battery: { label: "Battery", path: <><rect x="2" y="8" width="17" height="8" rx="2" /><path d="M22 11v2M6 11v2M10 11v2" /></> },
  cpu: { label: "Chip", path: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></> },
  zap: { label: "Performance", path: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /> },
  scale: { label: "Weight", path: <><path d="M12 3v3M6 6h12" /><path d="M6 6 3 14a3.5 3.5 0 0 0 6 0L6 6ZM18 6l-3 8a3.5 3.5 0 0 0 6 0l-3-8Z" /><path d="M8 21h8" /></> },
  droplet: { label: "Lubricant", path: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /> },
  shield: { label: "Durability", path: <><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /></> },
};

export const CARD_ICON_NAMES = Object.keys(CARD_ICONS) as CardIconName[];

/** Renders a registry icon by name; unknown names fall back to the first icon. */
export function CardIcon({ name }: { name: string }) {
  const def = CARD_ICONS[name as CardIconName] ?? CARD_ICONS[CARD_ICON_NAMES[0]];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {def.path}
    </svg>
  );
}

export type ProductCardFeature = { icon: string; label: string; value: string };
