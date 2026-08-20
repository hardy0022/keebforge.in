import type { ProductStatus, ProductType } from "@prisma/client";

export type { ProductStatus, ProductType };

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  KEYBOARD: "Keyboard",
  MOUSE: "Mouse",
  SWITCH: "Switch",
  KEYCAP: "Keycaps",
  STABILIZER: "Stabilizer",
  PCB: "PCB",
  CASE: "Case",
  CABLE: "Cable",
  ACCESSORY: "Accessory",
  BAREBONES: "Barebones",
  PLATE: "Plate",
  SPRING: "Spring",
  SWITCH_FILM: "Switch film",
  LUBRICANT: "Lubricant",
  DESK_MAT: "Desk mat",
  MOUSE_SWITCH: "Mouse switch",
  MOUSE_SKATE: "Mouse skates",
  ENCODER: "Encoder",
  TOOL: "Tool",
  FOAM: "Foam",
  MOD_ACCESSORY: "Modding accessory",
  DIY_KIT: "DIY kit",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  OUT_OF_STOCK: "Out of stock",
  ARCHIVED: "Archived",
};