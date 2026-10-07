-- Add selection mode to product option groups.
--
-- SINGLE = radio behaviour (exactly one selection, the pre-existing default).
-- MULTIPLE = checkbox behaviour (zero or more; at least one when "required").
--
-- Defaults every existing row to SINGLE, so no product changes behaviour until
-- an admin explicitly flips a group to MULTIPLE.

-- CreateEnum
CREATE TYPE "ProductOptionSelectionMode" AS ENUM ('SINGLE', 'MULTIPLE');

-- AlterTable
ALTER TABLE "ProductOptionGroup" ADD COLUMN "selectionMode" "ProductOptionSelectionMode" NOT NULL DEFAULT 'SINGLE';