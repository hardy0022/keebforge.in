/**
 * Client-safe shared limits for every customer-facing form/API.
 *
 * The twin of this file's validation service is src/lib/validation/customer-input.ts:
 * the form components spread the `maxLength`/`max` hints from here while the
 * server re-validates the same numbers, so the UI can never advertise a value
 * the API will reject (and an attacker cannot pick a looser bound than the
 * honest form does).
 *
 * No secrets, no server deps — safe to import from client components.
 */

export const MAX_NAME = 80;
export const MAX_FULL_NAME = 160;
export const MAX_LABEL = 40;
export const MAX_ADDRESS_LINE = 200;
export const MAX_CITY = 100;
export const MAX_STATE = 100;
export const MAX_COUNTRY = 100;
export const MAX_EMAIL = 254;
export const MAX_PHONE = 15;
export const PHONE_DIGITS = 10;

export const MAX_BRAND = 80;
export const MAX_MODEL = 120;
export const MAX_DEVICE_MODEL = 100;
export const MAX_LAYOUT = 40;
export const MAX_SWITCH_MODEL = 160;
export const MAX_ORDER_DESC = 2000;
export const MAX_CONTACT_NOTE = 200;
export const MAX_MODS_CONTACT_NOTE = 280;
export const MAX_CONDITION = 120;
export const MAX_BUDGET = 40;
export const MAX_LANDMARK = 200;

export const MAX_OPTION_IDS = 10;
export const MAX_OPTION_ID_LENGTH = 120;
export const MAX_ID_LENGTH = 120;
export const MAX_SERVICE_IDS = 60;
export const MAX_CART_QUANTITY = 50;
export const MAX_CART_LINES = 50;
export const MAX_ADDRESS_BOOK = 20;
export const MAX_WORK_TYPES = 10;
export const MAX_WORK_TYPE_LENGTH = 60;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_INQUIRY_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_REVIEW_TOTAL_IMAGE_BYTES = 16 * 1024 * 1024;
export const MAX_REPAIR_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;

/** Canonical custom-work labels — the /workshop allow-list, shared with the server schema. */
export const CUSTOM_WORK_TYPES = [
  "Custom Build",
  "Switch Modification",
  "Stabilizer Work",
  "Lubing",
  "Soldering",
  "PCB Work",
  "Firmware",
  "Case / Plate",
  "Keycaps",
  "Full Custom Build",
  "Other",
] as const;

/** Canonical repair-work labels — the /workshop allow-list, shared with the server schema. */
export const REPAIR_WORK_TYPES = [
  "Not powering on",
  "Keys not working",
  "Connection issue",
  "PCB issue",
  "Switch issue",
  "RGB issue",
  "Firmware issue",
  "Physical damage",
  "Liquid damage",
  "Other",
] as const;

export const ALL_WORK_TYPES: readonly string[] = [
  ...new Set([...CUSTOM_WORK_TYPES, ...REPAIR_WORK_TYPES]),
];

/** Mods quantity ceilings (spec: switch 0–300, mouse switch 0–20, stabilizer 0–20). */
export const MODS_QUANTITY_LIMITS = {
  SWITCH: 300,
  MOUSE_SWITCH: 20,
  STABILIZER: 20,
} as const;

/** Abusive-page size ceilings (handled per-bucket by |readJsonBody|). */
export const JSON_BODY_LIMIT_DEFAULT = 64 * 1024;
export const JSON_BODY_LIMIT_SMALL = 16 * 1024;
export const JSON_BODY_LIMIT_ORDER = 128 * 1024;
export const ORDER_JSON_LIMIT = JSON_BODY_LIMIT_ORDER;