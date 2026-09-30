-- At most one general review per customer.
--
-- The existing @@unique([profileId, productId]) cannot express this: general
-- reviews store productId = NULL, and PostgreSQL treats NULLs as distinct, so
-- a customer could stack unlimited general reviews and /write-review/edit had
-- to fall back to "newest wins" to pick one.
--
-- The predicate is pinned to type = 'GENERAL' rather than productId IS NULL
-- alone. productId is also NULL for a product review whose product was deleted
-- (ON DELETE SET NULL), and the existing index comment relies on those
-- orphaned reviews never colliding — a bare productId IS NULL predicate would
-- make a product deletion fail for any customer who also has a general review.
--
-- Guest/imported rows with profileId = NULL stay unconstrained, as with every
-- other unique index in this table.
CREATE UNIQUE INDEX "Review_one_general_review_per_profile"
  ON "Review" ("profileId")
  WHERE "productId" IS NULL AND "type" = 'GENERAL';
