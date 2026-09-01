-- AlterTable: add DEVELOPER to the Role enum (developer gets STAFF-level admin access).
ALTER TYPE "Role" ADD VALUE 'DEVELOPER';
