/**
 * Phase 8 runtime migration — Search & Discovery
 *
 * Adds:
 *   - search_queries : log of every search → drives trending + zero-result audit
 *
 * Idempotent.
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS search_queries (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    userId TEXT,
    resultCount INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_queries_query
    ON search_queries(query, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_search_queries_recent
    ON search_queries(createdAt)`,
];

export async function runPhase8Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase8] migration complete');
}
