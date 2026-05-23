/**
 * Phase 7 runtime migration — Reviews & Reputation
 *
 * Adds:
 *   - reviews : 1 row per (orderId, productId, customerId) tuple
 *               soft-moderated via isHidden + flagReason
 *
 * Idempotent.
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL,
    productId TEXT NOT NULL,
    customerId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    rating INTEGER NOT NULL,
    body TEXT NOT NULL,
    isHidden INTEGER NOT NULL DEFAULT 0,
    flagReason TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (orderId, productId, customerId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_product
    ON reviews(productId, isHidden, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_shop
    ON reviews(shopId, isHidden, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_customer
    ON reviews(customerId, createdAt)`,
];

export async function runPhase7Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase7] migration complete');
}
