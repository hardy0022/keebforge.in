import type { Role } from "@prisma/client";

/**
 * KeebForge admin permission matrix.
 * ADMIN → full access to everything.
 * STAFF → orders + repairs + read catalog/customers/services/settings.
 * CUSTOMER → no admin access.
 */

const STAFF_PERMISSIONS: Record<string, string[]> = {
  order: ["view", "update"],
  repair: ["view", "update"],
  product: ["view"],
  service: ["view"],
  customer: ["view"],
  setting: ["view"],
};

/** Permission check against the user's Profile.role. */
export function canAction(role: Role, resource: string, action: string): boolean {
  if (role === "ADMIN") return true;
  if (role === "STAFF") return STAFF_PERMISSIONS[resource]?.includes(action) ?? false;
  return false;
}

/**
 * Nav visibility — maps admin routes to the minimum role/permission needed.
 * Every admin page re-checks server-side; this only controls sidebar display.
 */
const NAV_PERMISSIONS: Record<string, [resource: string, action: string]> = {
  "/admin/orders": ["order", "view"],
  "/admin/repairs": ["repair", "view"],
  "/admin/products": ["product", "view"],
  "/admin/services": ["service", "view"],
  "/admin/customers": ["customer", "view"],
  "/admin/payments": ["order", "view"],
  "/admin/shipments": ["order", "view"],
  "/admin/reviews": ["product", "view"],
  "/admin/work": ["setting", "update"],
  "/admin/content": ["setting", "view"],
  "/admin/coupons": ["order", "view"],
  "/admin/analytics": ["order", "view"],
  "/admin/activity": ["order", "view"],
  "/admin/settings": ["setting", "view"],
};

/** Hrefs the given role may see in admin navigation (dashboard always visible). */
export function allowedNavHrefs(role: Role): string[] {
  return Object.entries(NAV_PERMISSIONS)
    .filter(([, perm]) => canAction(role, perm[0], perm[1]))
    .map(([href]) => href);
}
