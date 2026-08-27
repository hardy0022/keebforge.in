-- Rename the retired ServiceGroup category table to Mods (keeps its 6 rows).
ALTER TABLE "ServiceGroup" RENAME TO "Mods";

ALTER TABLE "Mods" RENAME CONSTRAINT "ServiceGroup_pkey" TO "Mods_pkey";
ALTER INDEX "ServiceGroup_slug_key" RENAME TO "Mods_slug_key";
ALTER INDEX "ServiceGroup_device_active_sortOrder_idx" RENAME TO "Mods_device_active_sortOrder_idx";