/**
 * Phase 9.2 runtime migration — Photo Reviews & Storage layer
 *
 * Tables:
 *   - storage_uploads    (audit of every presigned URL issued; lets us
 *                         attribute orphan objects back to a user)
 *   - review_photos      (1 review → up to 5 photos)
 *   - review_helpfuls    ("👍 helpful" votes, 1 user per review)
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + PRAGMA column checks.
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  // ---- Per-presign audit (used by admin orphan-cleanup + abuse detection)
  `CREATE TABLE IF NOT EXISTS storage_uploads (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    bucket TEXT NOT NULL,
    objectKey TEXT NOT NULL UNIQUE,
    contentType TEXT,
    sizeBytes INTEGER NOT NULL DEFAULT 0,
    purpose TEXT NOT NULL DEFAULT 'review_photo',
    status TEXT NOT NULL DEFAULT 'PENDING',
    sha256 TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmedAt DATETIME
  )`,
  `CREATE INDEX IF NOT EXISTS idx_storage_uploads_user
    ON storage_uploads(userId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_storage_uploads_purpose_status
    ON storage_uploads(purpose, status)`,

  // ---- Review photos
  `CREATE TABLE IF NOT EXISTS review_photos (
    id TEXT PRIMARY KEY,
    reviewId TEXT NOT NULL,
    objectKey TEXT NOT NULL,
    url TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    sizeBytes INTEGER,
    sha256 TEXT,
    isHidden INTEGER NOT NULL DEFAULT 0,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_photos_review
    ON review_photos(reviewId, sortOrder)`,
  `CREATE INDEX IF NOT EXISTS idx_review_photos_sha
    ON review_photos(sha256)`,

  // ---- "Was this helpful?" votes
  `CREATE TABLE IF NOT EXISTS review_helpfuls (
    id TEXT PRIMARY KEY,
    reviewId TEXT NOT NULL,
    userId TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(reviewId, userId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_review_helpfuls_review
    ON review_helpfuls(reviewId)`,
];

async function hasColumn(
  prisma: PrismaClient,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(
    `PRAGMA table_info(${table})`,
  )) as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

export async function runPhase9_2Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }

  // Cached helpful count on reviews (denormalised for cheap reads).
  // Older deployments don't have this column → additive ALTER.
  if (!(await hasColumn(prisma, 'reviews', 'helpfulCount'))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE reviews ADD COLUMN helpfulCount INTEGER NOT NULL DEFAULT 0`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase9-2] migration complete');
}
