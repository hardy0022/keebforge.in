/**
 * E2E seed — guarded entrypoint.
 *
 * Seeds the disposable database only. Two properties matter more than the seed
 * data itself:
 *
 *   1. The guard runs before `@prisma/client` is imported. Importing Prisma
 *      loads `.env` into `process.env`, and `.env`'s `DIRECT_URL` points at
 *      production. If the import were static, the module would be initialised —
 *      with production credentials in the environment — before any check could
 *      run. The import is therefore dynamic, and the only thing above it is
 *      `applyLocalEnv`.
 *
 *   2. Both connection variables are set explicitly by `applyLocalEnv`, which
 *      refuses unless they agree on an approved loopback database. dotenv does
 *      not overwrite already-set keys, so the verified values survive Prisma's
 *      later `.env` load.
 *
 * The seed payload is unchanged from the original `seed.mjs`: a disposable
 * category, product and guest cart, all tagged `E2E_`.
 */
import { describeTarget, type Target } from "./scratch-guard";
import { applyLocalEnv } from "./local-env";

const TAG = "E2E_SEED";

async function main(): Promise<void> {
  // Validated before any database-touching code exists in this process.
  const target: Target = applyLocalEnv();
  console.log(
    `Seeding disposable database ${describeTarget(target).database} on ` +
      `${describeTarget(target).host}:${describeTarget(target).port}`,
  );

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    await prisma.cartItem.deleteMany({
      where: { cart: { guestToken: { startsWith: TAG } } },
    });
    await prisma.cart.deleteMany({ where: { guestToken: { startsWith: TAG } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: TAG } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: TAG } } });

    const category = await prisma.category.create({
      data: { name: "E2E Category", slug: `${TAG}_CAT`, sortOrder: 0 },
    });

    const product = await prisma.product.create({
      data: {
        name: "E2E Test Keyboard",
        slug: `${TAG}_PROD`,
        type: "KEYBOARD",
        categoryId: category.id,
        price: 250_000,
        stock: 50,
        active: true,
        gstRate: 18,
        weight: 1200,
        freeShipping: true,
      },
    });

    const guestToken = `${TAG}_CART_1`;
    const cart = await prisma.cart.create({
      data: {
        guestToken,
        items: { create: { productId: product.id, quantity: 1 } },
      },
    });

    console.log(
      JSON.stringify({ cartCookie: guestToken, cartId: cart.id, productId: product.id }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});