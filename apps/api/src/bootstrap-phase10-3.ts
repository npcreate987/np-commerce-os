/**
 * Phase 10.3 runtime migration — Proactive Surfaces.
 *
 * Tables introduced:
 *
 *   proactive_nudges
 *     Append-only log of every proactive nudge the system has sent (push,
 *     in-app card, chatbot opener). Acts as a *dedupe ledger* — the sweepers
 *     check here before firing a second nudge for the same userId+kind+entityId
 *     within a cooldown window.
 *
 *   product_price_history
 *     Tiny rollup row per product per day so we can detect price drops.
 *     Today's value is upserted; older rows accumulate. Sweepers compute
 *     "did the price drop ≥ X% since the user last viewed this?" against this.
 *
 * Why these live in their own bootstrap rather than 10.2:
 *   10.2 ranked candidates from existing data; 10.3 *causes* outbound traffic
 *   (push notifications, in-app cards). Idempotency + audit are mandatory.
 *
 * Idempotent.
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  // ── proactive_nudges ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS proactive_nudges (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    kind TEXT NOT NULL,
    entityType TEXT,
    entityId TEXT,
    channel TEXT NOT NULL DEFAULT 'INAPP',
    payloadJson TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'SENT',
    sentAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_proactive_nudges_user_kind
    ON proactive_nudges(userId, kind, sentAt DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_proactive_nudges_user_entity
    ON proactive_nudges(userId, entityType, entityId, sentAt DESC)`,

  // ── product_price_history ──────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS product_price_history (
    productId TEXT NOT NULL,
    date TEXT NOT NULL,
    priceCents INTEGER NOT NULL,
    seenCount INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (productId, date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_price_history_product
    ON product_price_history(productId, date DESC)`,
];

export async function runPhase10_3Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase10-3] migration complete');
}
