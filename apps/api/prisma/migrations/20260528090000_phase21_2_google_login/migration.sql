-- Phase 21.2 — Google Sign-In
--
-- Mirrors the LINE fields added in 20260528003000_phase21_line_login. Each user
-- can authenticate via at most one external provider at a time (authProvider is
-- a single discriminator), but stores per-provider IDs and profile snapshots
-- so future cross-linking ("link Google to my existing LINE account") becomes
-- a column update rather than a schema migration.

ALTER TABLE "users" ADD COLUMN "googleUserId" TEXT;
ALTER TABLE "users" ADD COLUMN "googleDisplayName" TEXT;
ALTER TABLE "users" ADD COLUMN "googlePictureUrl" TEXT;

-- Unique across the whole platform (Google sub is globally unique within Google's
-- identity space). NULL slots are allowed because EMAIL/LINE-auth users have none.
CREATE UNIQUE INDEX "users_googleUserId_key" ON "users"("googleUserId");

CREATE INDEX "users_googleUserId_idx" ON "users"("googleUserId");
