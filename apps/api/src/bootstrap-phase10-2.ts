/**
 * Phase 10.2 runtime migration — User Taste Profile (the "brain").
 *
 *   user_profiles
 *     One denormalised row per user — the precomputed snapshot of their taste,
 *     refreshed asynchronously by `TasteWorker` from the firehose. Reads are
 *     hot path (called on every "For You" request); the row is intentionally
 *     small and self-contained — no JOINs needed at read time.
 *
 * Fields:
 *   - shopAffinityJson    Map<shopId, weight>   sparse vector
 *   - tagAffinityJson     Map<token, weight>    derived from product names
 *                                              (TF-IDF tokens of viewed items)
 *   - priceBandCents      median price the user looks at (with std deviation)
 *   - recentItemIdsJson   last 30 product IDs, ordered newest → oldest
 *   - eventCount          how many events fed this profile (for "cold start" detection)
 *   - windowDays          how far back the build looked (audit / debug)
 *   - generation          monotonic counter — bumped on each rebuild so other
 *                         components can detect "is this stale?"
 *   - lastUpdatedAt       used by the ranker to apply on-read exponential decay
 *
 * Idempotent.
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS user_profiles (
    userId TEXT PRIMARY KEY,
    shopAffinityJson TEXT NOT NULL DEFAULT '{}',
    tagAffinityJson TEXT NOT NULL DEFAULT '{}',
    priceMedianCents INTEGER NOT NULL DEFAULT 0,
    priceStdCents INTEGER NOT NULL DEFAULT 0,
    recentItemIdsJson TEXT NOT NULL DEFAULT '[]',
    boughtItemIdsJson TEXT NOT NULL DEFAULT '[]',
    eventCount INTEGER NOT NULL DEFAULT 0,
    windowDays INTEGER NOT NULL DEFAULT 30,
    generation INTEGER NOT NULL DEFAULT 0,
    lastUpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
    ON user_profiles(lastUpdatedAt DESC)`,
];

export async function runPhase10_2Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase10-2] migration complete');
}
