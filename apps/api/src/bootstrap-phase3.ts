/**
 * Phase 3 runtime migration — Creator / Affiliate Center
 *
 * Idempotent: ใช้ CREATE TABLE IF NOT EXISTS + เช็ค column ก่อน ALTER
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS creator_profiles (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL UNIQUE,
    displayName TEXT NOT NULL,
    bio TEXT,
    avatarUrl TEXT,
    socialJson TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    defaultCommissionBps INTEGER NOT NULL DEFAULT 500,
    totalSalesCents INTEGER NOT NULL DEFAULT 0,
    totalCommissionCents INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_creator_profiles_status
    ON creator_profiles(status)`,

  `CREATE TABLE IF NOT EXISTS creator_links (
    id TEXT PRIMARY KEY,
    creatorId TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    productId TEXT,
    shopId TEXT,
    label TEXT,
    commissionBps INTEGER,
    clickCount INTEGER NOT NULL DEFAULT 0,
    conversionCount INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_creator_links_creator_createdAt
    ON creator_links(creatorId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_creator_links_product
    ON creator_links(productId)`,
  `CREATE INDEX IF NOT EXISTS idx_creator_links_shop
    ON creator_links(shopId)`,

  `CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id TEXT PRIMARY KEY,
    linkId TEXT NOT NULL,
    fingerprint TEXT,
    ua TEXT,
    refererUrl TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_link_createdAt
    ON affiliate_clicks(linkId, createdAt)`,

  `CREATE TABLE IF NOT EXISTS affiliate_attributions (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL UNIQUE,
    linkId TEXT NOT NULL,
    creatorId TEXT NOT NULL,
    shopId TEXT NOT NULL,
    productId TEXT,
    commissionBps INTEGER NOT NULL,
    commissionCents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    releasedAt DATETIME
  )`,
  `CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_creator_status
    ON affiliate_attributions(creatorId, status)`,
  `CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_link_status
    ON affiliate_attributions(linkId, status)`,
];

export async function runPhase3Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }

  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase3] migration complete');
}
