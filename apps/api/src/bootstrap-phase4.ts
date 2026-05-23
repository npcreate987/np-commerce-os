/**
 * Phase 4 runtime migration — NP Local Commerce
 *
 * Tables:
 *   - local_stores
 *   - menu_categories
 *   - menu_item_maps
 *   - time_slots
 *   - riders
 *   - delivery_jobs
 *
 * Idempotent: ใช้ CREATE TABLE IF NOT EXISTS
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS local_stores (
    id TEXT PRIMARY KEY,
    shopId TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL DEFAULT 'LOCAL_GOODS',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    addressText TEXT NOT NULL,
    deliveryRadiusKm REAL NOT NULL DEFAULT 5,
    pickupEnabled INTEGER NOT NULL DEFAULT 1,
    deliveryEnabled INTEGER NOT NULL DEFAULT 1,
    prepTimeMinutes INTEGER NOT NULL DEFAULT 20,
    openHoursJson TEXT NOT NULL DEFAULT '{}',
    active INTEGER NOT NULL DEFAULT 1,
    baseDeliveryCents INTEGER NOT NULL DEFAULT 3500,
    perKmCents INTEGER NOT NULL DEFAULT 800,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_stores_active
    ON local_stores(active)`,

  `CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY,
    shopId TEXT NOT NULL,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_menu_categories_shop_sort
    ON menu_categories(shopId, sort)`,

  `CREATE TABLE IF NOT EXISTS menu_item_maps (
    id TEXT PRIMARY KEY,
    categoryId TEXT NOT NULL,
    productId TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    UNIQUE(categoryId, productId)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_menu_item_maps_product
    ON menu_item_maps(productId)`,

  `CREATE TABLE IF NOT EXISTS time_slots (
    id TEXT PRIMARY KEY,
    shopId TEXT NOT NULL,
    kind TEXT NOT NULL,
    startsAt DATETIME NOT NULL,
    endsAt DATETIME NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 5,
    taken INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_time_slots_shop_kind
    ON time_slots(shopId, kind, startsAt)`,

  `CREATE TABLE IF NOT EXISTS riders (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL UNIQUE,
    vehicle TEXT NOT NULL DEFAULT 'MOTORCYCLE',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    online TEXT NOT NULL DEFAULT 'OFFLINE',
    lat REAL,
    lng REAL,
    totalDeliveries INTEGER NOT NULL DEFAULT 0,
    totalEarningsCents INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_riders_status_online
    ON riders(status, online)`,

  `CREATE TABLE IF NOT EXISTS delivery_jobs (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL UNIQUE,
    riderId TEXT,
    status TEXT NOT NULL DEFAULT 'REQUESTED',
    pickupLat REAL NOT NULL,
    pickupLng REAL NOT NULL,
    pickupText TEXT NOT NULL,
    dropLat REAL NOT NULL,
    dropLng REAL NOT NULL,
    dropText TEXT NOT NULL,
    distanceKm REAL NOT NULL DEFAULT 0,
    riderFeeCents INTEGER NOT NULL DEFAULT 0,
    noteJson TEXT NOT NULL DEFAULT '[]',
    assignedAt DATETIME,
    pickedUpAt DATETIME,
    deliveredAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status_createdAt
    ON delivery_jobs(status, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_delivery_jobs_rider_status
    ON delivery_jobs(riderId, status)`,
];

const LOCAL_CARRIERS: Array<{
  code: string;
  name: string;
  kind: 'PARCEL' | 'EXPRESS_LOCAL';
  baseRateCents: number;
  perKgCents: number;
  etaText: string;
}> = [
  {
    code: 'NPRIDER',
    name: 'NP Local Rider',
    kind: 'EXPRESS_LOCAL',
    baseRateCents: 3500,
    perKgCents: 0,
    etaText: 'ภายใน 60 นาที',
  },
];

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

export async function runPhase4Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }

  // Seed Local rider carrier (separate from GRAB / LALAMOVE express)
  for (const c of LOCAL_CARRIERS) {
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

  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase4] migration complete');
}
