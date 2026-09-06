import { Prisma, PrismaClient } from "@prisma/client";

export { Prisma };

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// ponytail: defer PrismaClient instantiation — .env may not be loaded at module-eval time under Turbopack RSC.
// PRISMA_QUERY_LOG=1 prints every query to stdout — an observability/debug
// lever for measuring cached-query behavior (see the caching work in cache.ts).
// Bracket access avoids env inlining during turbopack build so the flag can be
// toggled on an already-built `next start`.
function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient(process.env["PRISMA_QUERY_LOG"] === "1" ? { log: ["query"] } : undefined);
  }
  return globalForPrisma.prisma;
}

// ponytail: Proxy keeps the `prisma.X` import surface unchanged across the codebase.
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getPrisma();
    const val = Reflect.get(client, prop);
    return typeof val === "function" ? val.bind(client) : val;
  },
});
