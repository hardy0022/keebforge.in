-- Add apartment/suite line to saved and order addresses
ALTER TABLE "Address" ADD COLUMN "apartment" TEXT;
ALTER TABLE "OrderAddress" ADD COLUMN "apartment" TEXT;
