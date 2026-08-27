-- Add optional metadata column to organization table (organization plugin)
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "metadata" TEXT;