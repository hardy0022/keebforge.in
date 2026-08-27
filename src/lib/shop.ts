import type { ShopSectionType } from "@prisma/client";

/** Max card highlights per product (admin editor + server action enforce this too). */
export const MAX_CARD_FEATURES = 3;

type PurchasableProduct = {
  active: boolean;
  status: string;
  productType: ShopSectionType;
  stock: number;
  reservedQuantity: number;
  variants?: { active: boolean; stock: number; reservedQuantity: number }[];
};

/**
 * Type-aware availability:
 * - CUSTOM: always orderable unless admin explicitly marks it OUT_OF_STOCK.
 * - NEW / CLEARANCE: normal inventory rules.
 */
export function isPurchasable(p: PurchasableProduct): boolean {
  if (!p.active || p.status === "DRAFT" || p.status === "ARCHIVED") return false;
  if (p.productType === "CUSTOM") return p.status !== "OUT_OF_STOCK";
  const avail = Math.max(0, p.stock - p.reservedQuantity);
  if (avail > 0) return true;
  return (p.variants ?? []).some((v) => v.active && v.stock - v.reservedQuantity > 0);
}

export const SECTION_LABELS: Record<ShopSectionType, { title: string; blurb: string }> = {
  CUSTOM: { title: "Made to Order", blurb: "Custom products built specifically for you." },
  NEW: { title: "Brand New", blurb: "New products available from KeebForge." },
  CLEARANCE: { title: "Clearance", blurb: "Discounted, clearance, open-box, used or older-stock items." },
};

export const CONDITION_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN_BOX: "Open Box",
  USED: "Used",
  REFURBISHED: "Refurbished",
  DISPLAY: "Display",
  CLEARANCE: "Clearance",
};
