/**
 * Pure shaping rules for the admin customer list.
 *
 * Kept apart from the data access on purpose: this module has no database,
 * framework or environment dependency, so the rules can be unit-tested
 * offline, while the module that talks to Prisma stays marked `server-only`.
 */

export type AdminCustomerKind = "all" | "registered" | "guest";

/** Only the three known kinds are accepted; anything else is "all". */
export function parseCustomerKind(raw: string | undefined): AdminCustomerKind {
  return raw === "registered" || raw === "guest" ? raw : "all";
}

/** A row plus the date it is ordered by in the merged list. */
export type CustomerSortKey = {
  sortDate: Date;
  email: string;
};

/**
 * Merge the registered and guest lists into one newest-first list and slice
 * out the requested page.
 *
 * Each side arrives already sorted newest-first and already trimmed to its
 * first `offset + size` entries. That is sufficient: an element can only be
 * inside the merged first `offset + size` if fewer than that many elements of
 * its own side are newer than it, so its side's top `offset + size` contains
 * it. The email is the tie-break so the order is stable across pages, and it
 * must be the SAME tie-break the SQL uses (`email ASC`), or the two sides
 * could disagree about which row belongs on a page.
 */
export function mergeCustomerRows<T extends CustomerSortKey>(
  registered: T[],
  guests: T[],
  offset: number,
  size: number,
): T[] {
  return [...registered, ...guests]
    .sort(
      (a, b) =>
        b.sortDate.getTime() - a.sortDate.getTime() ||
        a.email.localeCompare(b.email),
    )
    .slice(offset, offset + size);
}
