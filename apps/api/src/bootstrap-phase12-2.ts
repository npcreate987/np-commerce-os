import { PrismaClient } from '@prisma/client';

/**
 * Phase 12.2 — User Video Management + Admin Moderation
 *
 * Adds the moderation surface that was missing from Phase 12:
 *
 *   video_reports
 *     One row per user "Report" action against a video. Multiple reports
 *     against the same video accumulate — `video_posts.status` is auto-
 *     flipped to 'REPORTED' on the first one so the admin queue picks it up.
 *     Resolution writes `resolvedBy` / `resolvedAt` / `resolution`
 *     ('HIDE'|'KEEP'|'DELETE') so we keep a history of moderation decisions.
 *
 * The migration is idempotent and tolerant of partial prior runs (uses
 * `IF NOT EXISTS` everywhere). It also one-shot-cleans `video_posts.status`
 * values left in legacy states.
 *
 * Note on the `status` column:
 *   The existing `video_posts.status` column is a TEXT default 'ACTIVE'.
 *   Adding 'REPORTED' is a Zod-enum change only (no DDL needed) — SQLite
 *   accepts arbitrary strings. Phase 12 only knew 'ACTIVE'/'HIDDEN'/'DELETED';
 *   we extend that here without touching the table itself.
 */

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS video_reports (
    id TEXT PRIMARY KEY,
    videoId TEXT NOT NULL,
    reporterId TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    resolvedBy TEXT,
    resolvedAt DATETIME,
    resolution TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_reports_video
     ON video_reports(videoId, createdAt DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_video_reports_status
     ON video_reports(status, createdAt DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_video_reports_reporter
     ON video_reports(reporterId, createdAt DESC)`,

  // A user shouldn't be able to flood the queue by spamming Report on the
  // same video — one PENDING report per (video, reporter) at a time.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_video_reports_pending
     ON video_reports(videoId, reporterId)
     WHERE status = 'PENDING'`,
];

export async function runPhase12_2Migration(prisma: PrismaClient): Promise<void> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }

  // Best-effort housekeeping: any `video_posts` row whose status is empty/null
  // (would be a corruption bug) gets reset to ACTIVE so the feed query still
  // matches it. Cheap; runs at startup only.
  await prisma.$executeRawUnsafe(
    `UPDATE video_posts SET status = 'ACTIVE'
     WHERE status IS NULL OR TRIM(status) = ''`,
  );
}
