/**
 * Phase 6 runtime migration — AI Engine
 *
 * Adds:
 *   - product_views   : event log for popularity/recommendation signals
 *   - model_runs      : visibility for offline scoring jobs (future-proof)
 *
 * Seeds:
 *   - admin@np.dev / password123  → role = ADMIN, for admin pages
 *
 * Idempotent.
 */

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS product_views (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    userId TEXT,
    source TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_product_views_product
    ON product_views(productId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_product_views_user
    ON product_views(userId, createdAt)`,

  `CREATE TABLE IF NOT EXISTS model_runs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OK',
    durationMs INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_model_runs_kind
    ON model_runs(kind, createdAt)`,
];

const DEFAULT_ADMIN_EMAIL = 'admin@np.dev';
const DEFAULT_ADMIN_PASSWORD = 'password123';
const ADMIN_NAME = 'NP Admin';

/**
 * Seeds the platform admin account.
 *
 * Phase 13.3c hardening:
 *   - Email/password sourced from env (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) so the
 *     credentials are part of the deploy secrets, not the source tree.
 *   - In `NODE_ENV=production`, refuse to seed the well-known dev password —
 *     forcing the operator to set `ADMIN_PASSWORD` before bootstrap completes.
 *     This prevents production deploys from accidentally inheriting the
 *     hardcoded `password123`.
 *   - When the dev default is used in non-prod, log a *loud* warning so
 *     anyone tailing logs notices.
 */
async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const isDefaultPassword = password === DEFAULT_ADMIN_PASSWORD;

  if (isProd && isDefaultPassword) {
    throw new Error(
      '[bootstrap-phase6] refusing to seed admin with the default dev password in production — ' +
        'set ADMIN_PASSWORD env var (and ideally ADMIN_EMAIL too) before deploying',
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN' },
      });
    }
    if (isDefaultPassword && !isProd) {
      // eslint-disable-next-line no-console
      console.warn(
        `[bootstrap-phase6] ⚠️  admin account ${email} kept with DEFAULT dev password — ` +
          'set ADMIN_EMAIL / ADMIN_PASSWORD env vars before exposing this deploy',
      );
    }
    return;
  }
  const passwordHash = await argon2.hash(password);
  await prisma.user.create({
    data: {
      email,
      name: ADMIN_NAME,
      role: 'ADMIN',
      passwordHash,
    },
  });
  if (isDefaultPassword && !isProd) {
    // eslint-disable-next-line no-console
    console.warn(
      `[bootstrap-phase6] ⚠️  seeded admin ${email} with DEFAULT dev password — ` +
        'set ADMIN_EMAIL / ADMIN_PASSWORD env vars before exposing this deploy',
    );
  }
}

export async function runPhase6Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  await seedAdmin(prisma);
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase6] migration complete');
}
