/**
 * Phase 10.1 runtime migration — Behavioural Event Firehose.
 *
 * Tables:
 *   - user_events     append-only event log (every click, view, dwell, scroll,
 *                     cart change, purchase, search, …)
 *   - user_sessions   per browser tab/window; `anonId` is durable across
 *                     sessions (cookie), `sessionId` is per-tab.
 *   - user_consents   one row per user — opt-out / retention preferences.
 *
 * Indices are tuned for the queries the 10.2 ranker will run:
 *   - "events for this user in the last 30d, ordered"
 *   - "events for this entity in the last 7d" (popularity, trending)
 *   - "all events in the last hour" (cron retention + KPI cards)
 *
 * Idempotent — safe to run on every boot.
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS user_events (
    id TEXT PRIMARY KEY,
    userId TEXT,
    anonId TEXT,
    sessionId TEXT NOT NULL,
    kind TEXT NOT NULL,
    entityType TEXT,
    entityId TEXT,
    surface TEXT,
    metaJson TEXT NOT NULL DEFAULT '{}',
    dwellMs INTEGER,
    scrollPct INTEGER,
    referrer TEXT,
    userAgent TEXT,
    ts DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_user_ts
    ON user_events(userId, ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_anon_ts
    ON user_events(anonId, ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_entity
    ON user_events(entityType, entityId, ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_kind_ts
    ON user_events(kind, ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_events_session
    ON user_events(sessionId, ts)`,

  `CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    anonId TEXT NOT NULL,
    userId TEXT,
    userAgent TEXT,
    platform TEXT,
    startedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    eventCount INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_user
    ON user_sessions(userId, lastSeenAt DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_anon
    ON user_sessions(anonId, lastSeenAt DESC)`,

  `CREATE TABLE IF NOT EXISTS user_consents (
    userId TEXT PRIMARY KEY,
    behavioralOptedOut INTEGER NOT NULL DEFAULT 0,
    marketingOptedOut INTEGER NOT NULL DEFAULT 0,
    retentionDays INTEGER NOT NULL DEFAULT 180,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

export async function runPhase10Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase10] migration complete');
}
