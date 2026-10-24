import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_PAGE_SIZE, paginate, type Paginated } from "@/lib/admin/pagination";
import {
  mergeCustomerRows,
  type AdminCustomerKind,
  type CustomerSortKey,
} from "@/lib/admin/customer-rows";

export {
  mergeCustomerRows,
  parseCustomerKind,
  type AdminCustomerKind,
  type CustomerSortKey,
} from "@/lib/admin/customer-rows";

/**
 * Admin customer list — registered accounts AND guest checkouts.
 *
 * A "customer" here is an EMAIL that has ordered. Registered customers have a
 * `Profile` row; guest customers are the ones who checked out without ever
 * creating an account, so they have none. Both kinds are listed, and guest rows
 * are flagged so an operator can tell "has an account" from "ordered as a
 * guest" without opening the order.
 *
 * Why the guest set is computed in SQL. A guest is defined by the ABSENCE of a
 * `Profile` for an order's email — `NOT EXISTS` across two tables, which the
 * query builder cannot express. The alternative (pull every order email into
 * JS and subtract the profile emails) moves an unbounded set across the wire
 * and gets the de-duplication wrong.
 *
 * Identity is the EMAIL, exactly like the guest-order claim
 * (`claimGuestOrdersForProfile`): `Order.customerEmail` is lowercased at
 * creation and `Profile.email` is lowercased by Better Auth, so an exact
 * comparison is correct and never splits one person into two rows.
 *
 * Counts differ per kind on purpose:
 *   - registered rows count their orders through the `Profile` relation, so the
 *     numbers here match the order list and the revenue KPIs exactly;
 *   - guest rows count their own orders by email — every order of a guest
 *     email is necessarily unlinked, because linking requires a Profile.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdminCustomerRow = {
  /** Profile id, or `guest:<email>` for a guest checkout. */
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  phone: string | null;
  discordHandle: string | null;
  /** Profile.createdAt, or the guest's first order date. */
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
  isGuest: boolean;
};

export type AdminCustomerQuery = {
  q?: string;
  kind?: AdminCustomerKind;
  page?: number;
  pageSize?: number;
};

export type AdminCustomersResult = Paginated<AdminCustomerRow> & {
  /** Registered accounts in the current view. */
  registered: number;
  /** Guest checkouts in the current view. */
  guests: number;
  withOrders: number;
  allTimeSpent: number;
};

/** A list row plus the date it is ordered by in the merged list. */
type MergedCustomerRow = CustomerSortKey & { row: AdminCustomerRow };

// ─── Data access ────────────────────────────────────────────────────────────

type RegisteredCustomer = {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  phone: string | null;
  discordHandle: string | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
};

type RegisteredSide = {
  rows: RegisteredCustomer[];
  total: number;
  withOrders: number;
  spent: number;
};

type GuestCustomer = {
  email: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  firstOrder: Date;
};

type GuestSide = {
  rows: GuestCustomer[];
  total: number;
  spent: number;
};

/** Raw shape of the guest aggregate query (bigint counters, see below). */
type GuestRawRow = {
  email: string;
  name: string | null;
  phone: string | null;
  orderCount: bigint;
  totalSpent: bigint;
  firstOrder: Date;
  totalGuests: bigint;
  totalGuestSpent: bigint;
};

/**
 * Registered accounts: the page's worth of profiles plus the all-time
 * aggregates for the KPI cards.
 *
 * The aggregates are computed over the WHOLE matching set in SQL, not over the
 * current page, so their meaning does not change when paginating.
 */
async function loadRegisteredCustomers(
  where: Prisma.ProfileWhereInput,
  window: number,
): Promise<RegisteredSide> {
  const [total, rows, withOrders, spend] = await Promise.all([
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      // `email` breaks ties so the fetched prefix is deterministic: without it
      // the database may return same-date rows in any order, and the cut could
      // then drop a row that belongs on this page.
      orderBy: [{ createdAt: "desc" }, { email: "asc" }],
      take: window,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        phone: true,
        createdAt: true,
        customer: { select: { discordHandle: true } },
        _count: { select: { orders: { where: { isDeleted: false } } } },
      },
    }),
    prisma.profile.count({
      where: { ...where, orders: { some: { isDeleted: false } } },
    }),
    prisma.order.aggregate({
      where: { isDeleted: false, profile: where },
      _sum: { total: true },
    }),
  ]);

  // Spend for the profiles fetched above (≤ window rows), so the row count
  // does not scale with order volume.
  const spentByProfile = await prisma.order.groupBy({
    by: ["profileId"],
    where: { isDeleted: false, profileId: { in: rows.map((r) => r.id) } },
    _sum: { total: true },
  });
  const spent = new Map(
    spentByProfile.map((s) => [s.profileId, s._sum.total ?? 0]),
  );

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      email: r.email,
      phone: r.phone,
      discordHandle: r.customer?.discordHandle ?? null,
      createdAt: r.createdAt,
      orderCount: r._count.orders,
      totalSpent: spent.get(r.id) ?? 0,
    })),
    total,
    withOrders,
    spent: spend._sum.total ?? 0,
  };
}

/**
 * Guest customers: emails that ordered without an account.
 *
 * One query returns the page's guests AND the all-time guest totals: the
 * window functions run over the grouped set before the LIMIT, so
 * `totalGuests` / `totalGuestSpent` describe every guest, not just the page.
 *
 * `::bigint` is used for the counters so a large revenue sum cannot overflow
 * the 32-bit integer the column uses; they are converted to `number` here.
 */
async function loadGuestCustomers(
  term: string,
  window: number,
): Promise<GuestSide> {
  const like = `%${term}%`;
  const search = term
    ? Prisma.sql`AND (o."customerEmail" ILIKE ${like} OR o."customerName" ILIKE ${like} OR o."customerPhone" ILIKE ${like})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<GuestRawRow[]>(Prisma.sql`
    WITH g AS (
      SELECT
        o."customerEmail" AS email,
        (ARRAY_AGG(o."customerName"  ORDER BY o."createdAt" DESC))[1] AS name,
        (ARRAY_AGG(o."customerPhone" ORDER BY o."createdAt" DESC))[1] AS phone,
        COUNT(*)::bigint AS "orderCount",
        COALESCE(SUM(o.total), 0)::bigint AS "totalSpent",
        MIN(o."createdAt") AS "firstOrder"
      FROM "Order" o
      WHERE o."isDeleted" = false
        AND NOT EXISTS (
          SELECT 1 FROM "Profile" pr WHERE pr.email = o."customerEmail"
        )
        ${search}
      GROUP BY o."customerEmail"
    )
    SELECT
      g.email,
      g.name,
      g.phone,
      g."orderCount",
      g."totalSpent",
      g."firstOrder",
      COUNT(*) OVER ()::bigint AS "totalGuests",
      COALESCE(SUM(g."totalSpent") OVER (), 0)::bigint AS "totalGuestSpent"
    FROM g
    ORDER BY g."firstOrder" DESC, g.email ASC
    LIMIT ${window}
  `);

  return {
    rows: rows.map((r) => ({
      email: r.email,
      name: r.name,
      phone: r.phone,
      orderCount: Number(r.orderCount),
      totalSpent: Number(r.totalSpent),
      firstOrder: r.firstOrder,
    })),
    total: rows.length ? Number(rows[0].totalGuests) : 0,
    spent: rows.length ? Number(rows[0].totalGuestSpent) : 0,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Customer list, newest first, registered accounts and guest checkouts merged
 * into one list.
 *
 * The header KPIs ("with orders", "total spent") are all-time aggregates over
 * every matching customer computed in SQL — NOT derived from the current page,
 * which would silently change their meaning once paginated.
 */
export const getAdminCustomers = cache(
  async ({
    q,
    kind = "all",
    page = 1,
    pageSize = ADMIN_PAGE_SIZE,
  }: AdminCustomerQuery = {}): Promise<AdminCustomersResult> => {
    const term = q?.trim() ?? "";
    const wantsRegistered = kind !== "guest";
    const wantsGuests = kind !== "registered";
    const offset = (page - 1) * pageSize;
    // The merged list interleaves both kinds by date, so a page may need the
    // first N of EACH kind — not N of the visible one.
    const window = offset + pageSize;

    const profileWhere: Prisma.ProfileWhereInput = {
      role: "CUSTOMER",
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { username: { contains: term, mode: "insensitive" } },
              { email: { contains: term, mode: "insensitive" } },
              { phone: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [registered, guests] = await Promise.all([
      wantsRegistered
        ? loadRegisteredCustomers(profileWhere, window)
        : Promise.resolve(null),
      wantsGuests ? loadGuestCustomers(term, window) : Promise.resolve(null),
    ]);

    const registeredRows: MergedCustomerRow[] = (registered?.rows ?? []).map(
      (r) => ({
        sortDate: r.createdAt,
        email: r.email,
        row: {
          id: r.id,
          name: r.name,
          username: r.username,
          email: r.email,
          phone: r.phone,
          discordHandle: r.discordHandle,
          createdAt: r.createdAt,
          orderCount: r.orderCount,
          totalSpent: r.totalSpent,
          isGuest: false,
        },
      }),
    );

    const guestRows: MergedCustomerRow[] = (guests?.rows ?? []).map((g) => ({
      sortDate: g.firstOrder,
      email: g.email,
      row: {
        id: `guest:${g.email}`,
        name: g.name,
        username: null,
        email: g.email,
        phone: g.phone,
        discordHandle: null,
        createdAt: g.firstOrder,
        orderCount: g.orderCount,
        totalSpent: g.totalSpent,
        isGuest: true,
      },
    }));

    const items = mergeCustomerRows(registeredRows, guestRows, offset, pageSize).map(
      (m) => m.row,
    );
    const total = (registered?.total ?? 0) + (guests?.total ?? 0);
    // Every guest exists BECAUSE it ordered, so all of them have orders.
    const withOrders =
      (registered?.withOrders ?? 0) + (guests?.total ?? 0);
    const allTimeSpent = (registered?.spent ?? 0) + (guests?.spent ?? 0);

    return {
      ...paginate(items, total, page, pageSize),
      registered: registered?.total ?? 0,
      guests: guests?.total ?? 0,
      withOrders,
      allTimeSpent,
    };
  },
);
