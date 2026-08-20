# 03 — Database

Source of truth: `prisma/schema.prisma`. All migrations applied to the live Supabase PostgreSQL database.

## Money

**All money is integer paise.** ₹12 = `1200`. Floats never touch money. Display is the only place INR formatting happens (`formatINR()` in `src/lib/money.ts`). Every monetary column is annotated `// paise`.

## Host & connection

- `DATABASE_URL` — pooled (Supabase pooler, port 6543). Used by the app.
- `DIRECT_URL` — direct connection (port 5432). Used by Prisma CLI operations.
- Both are in `.env` and `.env.example`.

## Models (~35) grouped by domain

- **Enums:** `Role` (CUSTOMER/STAFF/ADMIN), `Device`, `ServiceUnit`, `OrderType`, `OrderStatus` (17-stage lifecycle), `PaymentStatus`, `ShippingStatus`, `ProductType` (22 values incl. mouse-part types), `ProductStatus` (DRAFT/ACTIVE/OUT_OF_STOCK/ARCHIVED), `ReviewType`, `ReviewStatus`, `WorkCategory`, `CouponType`, `MessageAuthor`.
- **Auth (Better Auth generated):** `User`, `Session`, `Account`, `Verification` (tables `user`, `session`, `account`, `verification`). Do not reshape these — see `04-auth.md`.
- **Identity:** `Profile` (KeebForge business data; links to `User` via nullable unique `userId`), `CustomerProfile`, `Address`.
- **Catalog:** `Category` (self-relation `parentId` for nesting + `image`), `Brand`, `Product` (see below), `ProductVariant` (+`barcode`, `weight`, `@@index([sku])`), `ProductImage` (+`variantId`, `active`, `primary`, `sortOrder`), `InventoryMovement` (ledger; +`variantId` and inverse relations to `ProductVariant`/`Profile`).
- **Product fields added in the product system:** `status`, `costPrice`, `barcode`, `allowBackorders`, `inventoryTracking`, `gstRate`, `weight`, `lengthCm/widthCm/heightCm`, `shippingClass`, `freeShipping`, `shippingRestrictions`, `seoKeywords`, `canonicalUrl`, `ogImageUrl`, `popular`, `isNew`, `ratingAverage`, `ratingCount`; indexes on `[sku]`, `[status, active]`, `[createdAt]`.
- **Services:** `ServiceGroup`, `Service` (supports price ranges via `priceMin/priceMax`, `priceLabel` for custom unit labels like `₹13/SK`, `combo`/`replaces`/`exclusiveWith` logic).
- **Orders:** `Order` (customer snapshots for guest checkout), `OrderItem` (+`discount`, `tax`, both default 0), `OrderService` (quote prices ARE persisted), `OrderRepair`, `Payment`, `Shipment`, `OrderTimeline`, `OrderMessage`, `WarrantyRecord`, `Tracking`.
- **Cart:** `Cart` (keyed by `profileId` **or** `guestToken`, both unique + nullable), `CartItem`.
- **Content:** `Review`, `Coupon`, `WorkProject` (`images` is a JSON blob `{url,alt}[]` — slated to become a `WorkImage` model with Cloudinary), `SiteSetting`.

## Key design decisions (see 06-decisions.md for rationale)

- Orders snapshot name/email/prices at order time → catalog edits never rewrite history.
- `Tracking` is a public-safe, denormalized, PII-free cache for `/track/[orderNumber]` — never serve raw orders publicly.
- `Review.orderId` is unique → one review per order; reviews are moderation-gated (`status: APPROVED` before public).
- `Product.active` defaults `false`; nothing public shows unless explicitly activated. `Product.status` (`ProductStatus`) is the primary workflow field; `active` mirrors it (`active = status !== DRAFT && !== ARCHIVED`) so existing public queries (`active: true`) keep working untouched.
- `WorkProject.images` as JSON is a known pending change: migrate to a `WorkImage` model storing `cloudinaryPublicId`, `secureUrl`, `width`, `height`, `sortOrder`, `isPrimary`, `altText`.

## Migration workflow — IMPORTANT

**Never run `prisma migrate dev`.** The shadow-database flow fails in this setup (the `auth` schema interferes). Use the manual pattern:

```bash
# 1. Edit prisma/schema.prisma
# 2. Validate + regenerate
npx prisma validate
npx prisma generate

# 3. Generate migration SQL against the live DB.
#    NOTE: strip quotes from the .env value and percent-encode the literal
#    '@' inside the password ('@6969@' → '%406969@') or the CLI rejects the URL.
URL=$(grep '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')
URL=${URL//@6969@/%406969@}
npx prisma migrate diff --from-url "$URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql

# 4. Apply
npx prisma migrate deploy
```

Migration history (all applied):
- `20260819140638_init`
- `20260819150000_rls_defense_in_depth`
- `20260819160000_review_author_fields`
- `20260819170000_shop_catalog_models`
- `20260819180000_better_auth`
- `20260819181000_better_auth_account_issuer`
- `20260820000000_order_address` — `OrderAddress` snapshot model (billing/shipping at order time)
- `20260821000000_product_system` — `ProductStatus` enum, product/category/brand/variant/image/inventory field additions, `OrderItem.discount`/`tax` (multi-value `ALTER TYPE … ADD VALUE` is fine on PG 15)

Seed: `npm run db:seed` (`tsx prisma/seed.ts`) — idempotent upserts; creates the ADMIN profile (`seed-admin`, `shadow@keebforge.in`) linked to the owner's Better Auth user, 9 categories, 8 brands, and **11 demo products** (keyboards/switches/keycaps/mice/stabilizers/lube/cable with images, prices, stock, specs). Demo products use `/images/work/*` files as placeholder imagery — replace with real uploads once Cloudinary creds exist.