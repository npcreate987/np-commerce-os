import { PrismaClient } from '@prisma/client';

/**
 * Phase 13 — Production-hardening migrations.
 *
 * Tables created:
 *
 *   refresh_tokens               — Phase 13.3b refresh-token ledger
 *   payment_webhook_events       — Phase 13.4b webhook dedup ledger
 *   payments.provider/providerRef — additive columns on existing payments
 *
 * Columns are added with `PRAGMA table_info` guarded ALTERs so SQLite (dev)
 * tolerates re-runs without errors. PostgreSQL (prod) is more forgiving;
 * the same SQL is safe there.
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    tokenHash TEXT NOT NULL UNIQUE,
    expiresAt TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revokedAt DATETIME,
    revokeReason TEXT,
    replacedById TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
     ON refresh_tokens(userId, revokedAt)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
     ON refresh_tokens(expiresAt)`,

  // -----------------------------------------------------------------------
  // payment_webhook_events  (Phase 13.4b)
  //
  // Dedup ledger for inbound payment webhooks. Providers retry on failure so
  // the same event id can arrive 2–10 times within minutes. We store every
  // successful verification keyed by (provider, providerEventId) so re-tries
  // are no-ops. Failed verifications (bad signature, malformed) deliberately
  // do NOT touch this table — the request just 401s.
  // -----------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    providerEventId TEXT NOT NULL,
    providerRef TEXT NOT NULL,
    status TEXT NOT NULL,
    amountCents INTEGER NOT NULL DEFAULT 0,
    receivedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settledAt DATETIME,
    note TEXT,
    UNIQUE(provider, providerEventId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payment_webhook_ref
     ON payment_webhook_events(provider, providerRef)`,
];

export async function runPhase13Migration(prisma: PrismaClient): Promise<void> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }

  // Additive columns on `payments` so we can store the gateway provider id +
  // its charge reference. Guarded by PRAGMA so re-runs are no-ops.
  const paymentCols = (await prisma.$queryRawUnsafe(
    `PRAGMA table_info('payments')`,
  )) as Array<{ name: string }>;
  const has = (col: string): boolean => paymentCols.some((c) => c.name === col);
  if (!has('provider')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE payments ADD COLUMN provider TEXT NOT NULL DEFAULT 'mock'`,
    );
  }
  if (!has('providerRef')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE payments ADD COLUMN providerRef TEXT`,
    );
  }
  if (!has('failureMessage')) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE payments ADD COLUMN failureMessage TEXT`,
    );
  }

  // Best-effort retention: prune tokens that have been expired for > 7 days
  // (no use case for keeping them; storage_uploads pattern is the same).
  await prisma.$executeRawUnsafe(
    `DELETE FROM refresh_tokens
     WHERE expiresAt < datetime('now','-7 days')`,
  );
}
