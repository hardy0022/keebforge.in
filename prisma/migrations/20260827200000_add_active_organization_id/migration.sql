-- Add activeOrganizationId column to session table (required by organization plugin)
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "activeOrganizationId" TEXT;
