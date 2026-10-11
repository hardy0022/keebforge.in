/**
 * Server-side twin of src/lib/utils/limits.ts.
 *
 * Every customer-facing API/action validates through these composable schemas,
 * which are the single source for the limits the client hints (maxLength,
 * HTML form constraints) advertise. Keeping the zod rules here means one edit
 * touches every surface at once and the client can never drift ahead of the
 * server.
 *
 * Imports only zod + the shared constants: safe for the tsx check scripts.
 */
import { z } from "zod";
import {
  ALL_WORK_TYPES,
  MAX_ADDRESS_LINE,
  MAX_EMAIL,
  MAX_LANDMARK,
  MAX_LABEL,
  MAX_NAME,
  MAX_OPTION_ID_LENGTH,
  MAX_OPTION_IDS,
  MAX_WORK_TYPES,
  MAX_WORK_TYPE_LENGTH,
} from "@/lib/utils/limits";
import { EMAIL_RE } from "@/lib/utils/email";
import { PHONE_RE } from "@/lib/utils/phone";

const INVALID_EMAIL = "Enter a valid email address.";
const INVALID_PHONE = "Phone number must be exactly 10 digits.";

export const emailField = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(MAX_EMAIL, `Email must be under ${MAX_EMAIL} characters.`)
    .refine((v) => EMAIL_RE.test(v), INVALID_EMAIL);

export const requiredText = (field: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required.`)
    .max(max, `${field} must be under ${max} characters.`);

export const optionalText = (max: number) =>
  z.string().trim().max(max).optional();

/** A 10-digit phone that may also be absent ("" → undefined). */
export const phoneField = () =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_RE.test(v), INVALID_PHONE)
    .optional()
    .transform((v) => (v ? v : undefined));

/** A required 10-digit phone. */
export const phoneFieldRequired = () =>
  z.string().trim().refine((v) => PHONE_RE.test(v), INVALID_PHONE);

const PIN_RE = /^\d{6}$/;

export const pinCodeField = () =>
  z
    .string()
    .trim()
    .regex(PIN_RE, "Enter a valid 6-digit PIN code.");

export const optionalPinCodeField = () =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || PIN_RE.test(v), "Enter a valid 6-digit PIN code.")
    .optional();

/** Work types: 1–10 allow-listed values (spec: allow-listed, never free text). */
export const workTypesField = () =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(MAX_WORK_TYPE_LENGTH)
        .refine(
          (v) => (ALL_WORK_TYPES as string[]).includes(v),
          "Please choose a listed type of work.",
        ),
    )
    .min(1, "Select at least one type of work.")
    .max(MAX_WORK_TYPES);

/** The one shared address-book schema (POST uses it whole, PATCH pipes it through preprocess + partial). */
export const addressBookFields = {
  label: optionalText(MAX_LABEL),
  firstName: requiredText("First name", MAX_NAME),
  lastName: requiredText("Last name", MAX_NAME),
  email: emailField().optional(),
  streetAddress: requiredText("Address", MAX_ADDRESS_LINE),
  apartment: optionalText(MAX_ADDRESS_LINE),
  city: requiredText("City", 100),
  state: requiredText("State", 100),
  postalCode: pinCodeField(),
  country: optionalText(100),
  phone: phoneFieldRequired().optional(),
  isDefault: z.boolean().optional(),
} as const;

/**
 * JSON-encoded option-ids string (what the cart action receives). At most
 * MAX_OPTION_IDS ids, each a bounded cuid-like string, no duplicates.
 */
export const optionIdsJson = () =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      try {
        const arr: unknown = JSON.parse(v);
        if (
          Array.isArray(arr) &&
          arr.length <= MAX_OPTION_IDS &&
          arr.every(
            (x) =>
              typeof x === "string" &&
              x.length >= 1 &&
              x.length <= MAX_OPTION_ID_LENGTH,
          ) &&
          new Set(arr).size === arr.length
        ) {
          return arr as string[];
        }
      } catch {
        /* fallthrough */
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid configuration.",
      });
      return z.NEVER;
    });

/** A landmark/Apt line: bounded, empty clears. */
export const landmarkField = () => optionalText(MAX_LANDMARK);