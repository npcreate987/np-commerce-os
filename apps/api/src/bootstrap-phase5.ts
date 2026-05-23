/**
 * Phase 5 runtime migration — NP Marketing Engine
 *
 * Tables:
 *   - coupons, coupon_redemptions
 *   - loyalty_accounts, loyalty_entries
 *   - referrals, referral_claims
 *   - campaigns, campaign_products
 *   - video_posts, video_reactions
 *   - broadcasts, inapp_messages
 *
 * Idempotent: ใช้ CREATE TABLE IF NOT EXISTS
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  // ----- Coupons -----
  `CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    shopId TEXT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL DEFAULT 'PERCENT',
    value INTEGER NOT NULL DEFAULT 0,
    minSpendCents INTEGER NOT NULL DEFAULT 0,
    maxDiscountCents INTEGER NOT NULL DEFAULT 0,
    totalLimit INTEGER NOT NULL DEFAULT 0,
    perUserLimit INTEGER NOT NULL DEFAULT 1,
    used INTEGER NOT NULL DEFAULT 0,
    startsAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    endsAt DATETIME,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coupons_shop_active ON coupons(shopId, active)`,
  `CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)`,

  `CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id TEXT PRIMARY KEY,
    couponId TEXT NOT NULL,
    userId TEXT NOT NULL,
    orderId TEXT,
    discountCents INTEGER NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(couponId, orderId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user
    ON coupon_redemptions(couponId, userId)`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user_only
    ON coupon_redemptions(userId)`,

  // ----- Loyalty -----
  `CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL UNIQUE,
    points INTEGER NOT NULL DEFAULT 0,
    lifetimePoints INTEGER NOT NULL DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'BRONZE',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS loyalty_entries (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    kind TEXT NOT NULL,
    points INTEGER NOT NULL,
    refType TEXT,
    refId TEXT,
    note TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_entries_account
    ON loyalty_entries(accountId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_entries_ref
    ON loyalty_entries(refType, refId)`,

  // ----- Referrals -----
  `CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    inviterId TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    rewardPoints INTEGER NOT NULL DEFAULT 50,
    inviteeRewardPoints INTEGER NOT NULL DEFAULT 50,
    uses INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviterId)`,

  `CREATE TABLE IF NOT EXISTS referral_claims (
    id TEXT PRIMARY KEY,
    referralId TEXT NOT NULL,
    inviteeId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    rewardedAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referralId, inviteeId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_referral_claims_invitee
    ON referral_claims(inviteeId)`,

  // ----- Campaigns -----
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    shopId TEXT,
    kind TEXT NOT NULL DEFAULT 'FLASH_DEAL',
    title TEXT NOT NULL,
    description TEXT,
    value INTEGER NOT NULL DEFAULT 0,
    metaJson TEXT NOT NULL DEFAULT '{}',
    bannerUrl TEXT,
    startsAt DATETIME NOT NULL,
    endsAt DATETIME NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_kind_active
    ON campaigns(kind, active, startsAt)`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_shop_active
    ON campaigns(shopId, active)`,

  `CREATE TABLE IF NOT EXISTS campaign_products (
    id TEXT PRIMARY KEY,
    campaignId TEXT NOT NULL,
    productId TEXT NOT NULL,
    flashPriceCents INTEGER,
    stockCap INTEGER NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaignId, productId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_products_product
    ON campaign_products(productId)`,

  // ----- Video Posts -----
  `CREATE TABLE IF NOT EXISTS video_posts (
    id TEXT PRIMARY KEY,
    authorId TEXT NOT NULL,
    productId TEXT,
    shopId TEXT,
    videoUrl TEXT NOT NULL,
    thumbUrl TEXT,
    caption TEXT NOT NULL DEFAULT '',
    tagsJson TEXT NOT NULL DEFAULT '[]',
    likes INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    score REAL NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_posts_status_score
    ON video_posts(status, score)`,
  `CREATE INDEX IF NOT EXISTS idx_video_posts_author
    ON video_posts(authorId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_video_posts_product
    ON video_posts(productId)`,

  `CREATE TABLE IF NOT EXISTS video_reactions (
    id TEXT PRIMARY KEY,
    videoId TEXT NOT NULL,
    userId TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'LIKE',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(videoId, userId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_video_reactions_user
    ON video_reactions(userId)`,

  // ----- Broadcasts -----
  `CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    shopId TEXT,
    channel TEXT NOT NULL DEFAULT 'INAPP',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'ALL',
    status TEXT NOT NULL DEFAULT 'DRAFT',
    sentCount INTEGER NOT NULL DEFAULT 0,
    failedCount INTEGER NOT NULL DEFAULT 0,
    scheduledAt DATETIME,
    sentAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_broadcasts_shop_status
    ON broadcasts(shopId, status)`,
  `CREATE INDEX IF NOT EXISTS idx_broadcasts_status_scheduled
    ON broadcasts(status, scheduledAt)`,

  `CREATE TABLE IF NOT EXISTS inapp_messages (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    broadcastId TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    ctaJson TEXT NOT NULL DEFAULT '{}',
    read INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inapp_messages_user
    ON inapp_messages(userId, read, createdAt)`,
];

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Seed คูปองตัวอย่างของแพลตฟอร์ม + 1 Flash Deal Campaign (idempotent)
 */
async function seedDefaults(prisma: PrismaClient): Promise<void> {
  // ----- Coupons (platform-wide) -----
  const coupons: Array<{
    code: string;
    title: string;
    kind: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
    value: number;
    minSpendCents: number;
    maxDiscountCents: number;
  }> = [
    {
      code: 'NPWELCOME',
      title: 'ยินดีต้อนรับ ลด 10%',
      kind: 'PERCENT',
      value: 1000,
      minSpendCents: 0,
      maxDiscountCents: 5000,
    },
    {
      code: 'FREESHIP',
      title: 'ส่งฟรีทั่วประเทศ',
      kind: 'FREE_SHIPPING',
      value: 0,
      minSpendCents: 19900,
      maxDiscountCents: 0,
    },
    {
      code: 'NP200',
      title: 'ส่วนลด 200 บาท ขั้นต่ำ 1,000',
      kind: 'FIXED',
      value: 20000,
      minSpendCents: 100000,
      maxDiscountCents: 0,
    },
  ];

  for (const c of coupons) {
    const existing = (await prisma.$queryRawUnsafe(
      `SELECT id FROM coupons WHERE code = ?`,
      c.code,
    )) as Array<{ id: string }>;
    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO coupons
          (id, shopId, code, title, kind, value, minSpendCents, maxDiscountCents,
           totalLimit, perUserLimit, used, startsAt, endsAt, active)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, 1, 0, CURRENT_TIMESTAMP, NULL, 1)`,
        newId('cou'),
        c.code,
        c.title,
        c.kind,
        c.value,
        c.minSpendCents,
        c.maxDiscountCents,
      );
    }
  }

  // ----- Default Flash Deal — 24h window starting now -----
  const flashExisting = (await prisma.$queryRawUnsafe(
    `SELECT id FROM campaigns WHERE kind = 'FLASH_DEAL' AND title = ? LIMIT 1`,
    'Flash Deal วันนี้',
  )) as Array<{ id: string }>;

  if (flashExisting.length === 0) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await prisma.$executeRawUnsafe(
      `INSERT INTO campaigns
        (id, shopId, kind, title, description, value, metaJson, startsAt, endsAt, active)
       VALUES (?, NULL, 'FLASH_DEAL', ?, ?, ?, '{}', ?, ?, 1)`,
      newId('cam'),
      'Flash Deal วันนี้',
      'รวมสินค้าลดราคาเฉพาะวันนี้',
      1500, // 15%
      now.toISOString(),
      tomorrow.toISOString(),
    );
  }

  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase5] migration complete');
}

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

export async function runPhase5Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }

  // Additive columns on orders (idempotent via PRAGMA check)
  const orderCols: Array<{ name: string; ddl: string }> = [
    { name: 'couponCode', ddl: `ALTER TABLE orders ADD COLUMN couponCode TEXT` },
    { name: 'couponId', ddl: `ALTER TABLE orders ADD COLUMN couponId TEXT` },
    {
      name: 'discountCents',
      ddl: `ALTER TABLE orders ADD COLUMN discountCents INTEGER NOT NULL DEFAULT 0`,
    },
    {
      name: 'redeemPoints',
      ddl: `ALTER TABLE orders ADD COLUMN redeemPoints INTEGER NOT NULL DEFAULT 0`,
    },
  ];
  for (const c of orderCols) {
    if (!(await hasColumn(prisma, 'orders', c.name))) {
      await prisma.$executeRawUnsafe(c.ddl);
    }
  }

  await seedDefaults(prisma);
}
