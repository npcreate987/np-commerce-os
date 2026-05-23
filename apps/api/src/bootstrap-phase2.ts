/**
 * Phase 2 runtime migration — applied on API startup.
 *
 * เพราะใน sandbox dev เรารัน `prisma db push` ไม่ได้ (DB file ถูก lock โดย API)
 * เราจึงเปิด table ใหม่ + เพิ่ม column ผ่าน raw SQL ตอน boot
 *
 * เมื่อขึ้น production ให้รัน `prisma migrate dev` ตามปกติ — DDL นี้เป็น idempotent
 * ใช้ `CREATE TABLE IF NOT EXISTS` + เช็ค column ก่อน ADD
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL UNIQUE,
    availableCents INTEGER NOT NULL DEFAULT 0,
    pendingCents INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_entries (
    id TEXT PRIMARY KEY,
    walletId TEXT NOT NULL,
    kind TEXT NOT NULL,
    amountCents INTEGER NOT NULL,
    orderId TEXT,
    description TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_entries_wallet_createdAt
    ON wallet_entries(walletId, createdAt)`,
  `CREATE TABLE IF NOT EXISTS carriers (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'PARCEL',
    logoUrl TEXT,
    baseRateCents INTEGER NOT NULL DEFAULT 3000,
    perKgCents INTEGER NOT NULL DEFAULT 1500,
    etaText TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL UNIQUE,
    carrierId TEXT NOT NULL,
    trackingNo TEXT,
    labelUrl TEXT,
    costCents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'LABEL_CREATED',
    events TEXT NOT NULL DEFAULT '[]',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shipments_carrier_status
    ON shipments(carrierId, status)`,
  `CREATE TABLE IF NOT EXISTS disputes (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'OPEN',
    reason TEXT NOT NULL,
    description TEXT NOT NULL,
    evidenceJson TEXT NOT NULL DEFAULT '[]',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_disputes_status_createdAt
    ON disputes(status, createdAt)`,
  `CREATE TABLE IF NOT EXISTS dispute_messages (
    id TEXT PRIMARY KEY,
    disputeId TEXT NOT NULL,
    authorId TEXT NOT NULL,
    authorRole TEXT NOT NULL,
    body TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute_createdAt
    ON dispute_messages(disputeId, createdAt)`,
];

const CARRIERS: Array<{
  code: string;
  name: string;
  kind: 'PARCEL' | 'EXPRESS_LOCAL';
  baseRateCents: number;
  perKgCents: number;
  etaText: string;
}> = [
  { code: 'FLASH', name: 'Flash Express', kind: 'PARCEL', baseRateCents: 3500, perKgCents: 1200, etaText: '1–2 วัน' },
  { code: 'KERRY', name: 'Kerry Express', kind: 'PARCEL', baseRateCents: 4500, perKgCents: 1500, etaText: '1–3 วัน' },
  { code: 'JT', name: 'J&T Express', kind: 'PARCEL', baseRateCents: 3000, perKgCents: 1100, etaText: '1–2 วัน' },
  { code: 'THP', name: 'ไปรษณีย์ไทย EMS', kind: 'PARCEL', baseRateCents: 5000, perKgCents: 2000, etaText: '2–3 วัน' },
  { code: 'GRAB', name: 'Grab Express', kind: 'EXPRESS_LOCAL', baseRateCents: 6000, perKgCents: 0, etaText: 'ภายใน 2 ชม.' },
  { code: 'LALAMOVE', name: 'Lalamove', kind: 'EXPRESS_LOCAL', baseRateCents: 5500, perKgCents: 0, etaText: 'ภายใน 2 ชม.' },
];

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

async function hasColumn(prisma: PrismaClient, table: string, column: string): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`)) as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

export async function runPhase2Migration(prisma: PrismaClient): Promise<void> {
  // 1) Create new tables
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }

  // 2) Additive column on orders: carrierCode
  if (!(await hasColumn(prisma, 'orders', 'carrierCode'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE orders ADD COLUMN carrierCode TEXT`);
  }

  // 3) Seed carriers (insert only if not present)
  for (const c of CARRIERS) {
    const existing = (await prisma.$queryRawUnsafe(
      `SELECT id FROM carriers WHERE code = ?`,
      c.code,
    )) as Array<{ id: string }>;
    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO carriers (id, code, name, kind, baseRateCents, perKgCents, etaText, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        newId('car'),
        c.code,
        c.name,
        c.kind,
        c.baseRateCents,
        c.perKgCents,
        c.etaText,
      );
    }
  }

  // 4) Ensure wallets for all merchant users
  const merchants = (await prisma.$queryRawUnsafe(
    `SELECT id FROM users WHERE role = 'MERCHANT'`,
  )) as Array<{ id: string }>;
  for (const m of merchants) {
    const ex = (await prisma.$queryRawUnsafe(
      `SELECT id FROM wallets WHERE userId = ?`,
      m.id,
    )) as Array<{ id: string }>;
    if (ex.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO wallets (id, userId, availableCents, pendingCents) VALUES (?, ?, 0, 0)`,
        newId('wal'),
        m.id,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase2] migration complete');
}
