-- Phase 21 — LINE Login support
--
-- - Email / passwordHash become nullable because LINE accounts may not
--   grant the `email` scope and never have a local password.
-- - New columns capture the LINE identity + a per-user `authProvider`
--   sentinel so we can tell EMAIL accounts apart from LINE-onboarded ones.
-- - `users_lineUserId_key` enforces 1:1 mapping between LINE and our User.

ALTER TABLE "users"
  ALTER COLUMN "email"        DROP NOT NULL,
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "authProvider"    TEXT NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN "lineUserId"      TEXT,
  ADD COLUMN "lineDisplayName" TEXT,
  ADD COLUMN "linePictureUrl"  TEXT;

CREATE UNIQUE INDEX "users_lineUserId_key" ON "users"("lineUserId");
CREATE INDEX        "users_lineUserId_idx" ON "users"("lineUserId");
