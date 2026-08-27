import { Prisma, PrismaClient } from "@prisma/client";

export { Prisma };

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// ponytail: defer PrismaClient instantiation — .env may not be loaded at module-eval time under Turbopack RSC.
function getPrisma() {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = new PrismaClient();
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
