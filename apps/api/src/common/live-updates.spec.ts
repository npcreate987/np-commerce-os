import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { LiveUpdatesCacheService } from './live-updates-cache.service';
import type { PrismaService } from './prisma/prisma.service';

/**
 * Phase 19.3 — Unit tests for the persistent OTA manifest cache.
 *
 * The cache now reads/writes Postgres via Prisma. We stub the Prisma
 * delegate so these tests run in-memory without a DB; the integration
 * test for actual upsert lives in `apps/api/test/integration/live-updates.e2e.ts`
 * (TODO Phase 19.4 once we wire up `vitest-environment-postgres`).
 *
 * The HMAC-verification function is not exported from the controller
 * (it's an internal helper), so we re-implement the same algorithm
 * here in test code and assert that round-trips work. The point is to
 * pin down the byte-exact protocol the CI workflow must follow.
 */

const SECRET = 'test-secret-do-not-use-in-prod';

function sign(rawBody: string): string {
  const digest = createHmac('sha256', SECRET).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

interface FakeRow {
  channel: string;
  version: string;
  buildId: string;
  url: string;
  checksum: string;
  size: number;
  rolloutPct: number;
  minNativeVersion: string | null;
  updatedAt: Date;
}

/**
 * Minimal in-memory stand-in for `prisma.liveUpdateManifest` that
 * matches the surface area the service actually uses (`findMany`,
 * `upsert`, `deleteMany`). Anything else throws so we notice if the
 * service grows new dependencies that need test coverage.
 */
function makeFakePrisma(): {
  prisma: PrismaService;
  rows: Map<string, FakeRow>;
  failNext: { rehydrate: boolean; upsert: boolean };
} {
  const rows = new Map<string, FakeRow>();
  const failNext = { rehydrate: false, upsert: false };
  const delegate = {
    findMany: vi.fn(async () => {
      if (failNext.rehydrate) {
        failNext.rehydrate = false;
        throw new Error('simulated db unreachable on boot');
      }
      return Array.from(rows.values());
    }),
    upsert: vi.fn(async (args: { where: { channel: string }; create: FakeRow; update: FakeRow }) => {
      if (failNext.upsert) {
        failNext.upsert = false;
        throw new Error('simulated db write failure');
      }
      const now = new Date();
      const row: FakeRow = {
        ...args.create,
        updatedAt: now,
      };
      rows.set(args.where.channel, row);
      return row;
    }),
    deleteMany: vi.fn(async () => {
      const n = rows.size;
      rows.clear();
      return { count: n };
    }),
  };
  // Cast through `unknown` so we don't have to mirror the entire Prisma surface.
  const prisma = { liveUpdateManifest: delegate } as unknown as PrismaService;
  return { prisma, rows, failNext };
}

describe('LiveUpdatesCacheService — persistence', () => {
  let svc: LiveUpdatesCacheService;
  let fake: ReturnType<typeof makeFakePrisma>;

  beforeEach(() => {
    fake = makeFakePrisma();
    svc = new LiveUpdatesCacheService(fake.prisma);
  });

  it('returns undefined for missing channel', async () => {
    await svc.onModuleInit();
    expect(svc.get('production')).toBeUndefined();
  });

  it('persists via upsert and mirrors to memory', async () => {
    await svc.onModuleInit();
    const applied = await svc.update({
      channel: 'beta',
      version: '1.0.5',
      buildId: 'abc123',
      url: 'https://example.com/bundle.zip',
      checksum: 'a'.repeat(64),
      size: 1024,
      rolloutPct: 10,
    });
    expect(applied.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(svc.get('beta')).toMatchObject({ buildId: 'abc123', rolloutPct: 10 });
    // And the fake DB now has the row
    expect(fake.rows.get('beta')?.buildId).toBe('abc123');
  });

  it('rehydrates memory from db on boot', async () => {
    // Pre-seed the fake DB as if a previous instance had persisted overrides
    fake.rows.set('production', {
      channel: 'production',
      version: '1.0.4',
      buildId: 'prod-x',
      url: 'https://e.com/p.zip',
      checksum: 'b'.repeat(64),
      size: 100,
      rolloutPct: 100,
      minNativeVersion: null,
      updatedAt: new Date('2026-05-27T05:30:00Z'),
    });
    fake.rows.set('beta', {
      channel: 'beta',
      version: '1.0.5',
      buildId: 'beta-y',
      url: 'https://e.com/b.zip',
      checksum: 'c'.repeat(64),
      size: 200,
      rolloutPct: 50,
      minNativeVersion: '1.0.0',
      updatedAt: new Date('2026-05-27T05:31:00Z'),
    });
    // Boot — should pull both into memory
    await svc.onModuleInit();
    expect(svc.list()).toHaveLength(2);
    expect(svc.get('production')?.buildId).toBe('prod-x');
    expect(svc.get('beta')?.buildId).toBe('beta-y');
    expect(svc.get('beta')?.minNativeVersion).toBe('1.0.0');
  });

  it('boot with empty db produces empty cache (not a crash)', async () => {
    await svc.onModuleInit();
    expect(svc.list()).toHaveLength(0);
  });

  it('boot survives db unreachable — degrades to empty cache', async () => {
    fake.failNext.rehydrate = true;
    // Must NOT throw — production behaviour: start up with empty memory and
    // log a warning, so /manifest falls back to env vars until the next
    // webhook fires.
    await expect(svc.onModuleInit()).resolves.not.toThrow();
    expect(svc.list()).toHaveLength(0);
  });

  it('webhook write failure propagates (we MUST NOT ack on silent loss)', async () => {
    await svc.onModuleInit();
    fake.failNext.upsert = true;
    await expect(
      svc.update({
        channel: 'beta',
        version: '1.0.5',
        buildId: 'abc',
        url: 'https://e.com/x.zip',
        checksum: 'a'.repeat(64),
        size: 1,
        rolloutPct: 10,
      }),
    ).rejects.toThrow(/simulated db write failure/);
    // Memory should NOT have been updated on a failed persist
    expect(svc.get('beta')).toBeUndefined();
  });

  it('keeps production and beta separate', async () => {
    await svc.onModuleInit();
    await svc.update({
      channel: 'production',
      version: '1.0.4',
      buildId: 'prod-x',
      url: 'https://e.com/p.zip',
      checksum: 'b'.repeat(64),
      size: 100,
      rolloutPct: 100,
    });
    await svc.update({
      channel: 'beta',
      version: '1.0.5',
      buildId: 'beta-y',
      url: 'https://e.com/b.zip',
      checksum: 'c'.repeat(64),
      size: 200,
      rolloutPct: 50,
    });
    expect(svc.get('production')?.buildId).toBe('prod-x');
    expect(svc.get('beta')?.buildId).toBe('beta-y');
    expect(svc.list()).toHaveLength(2);
  });

  it('overwrites prior override for same channel (upsert semantics)', async () => {
    await svc.onModuleInit();
    await svc.update({
      channel: 'beta',
      version: '1.0.4',
      buildId: 'old',
      url: 'https://e.com/o.zip',
      checksum: 'a'.repeat(64),
      size: 1,
      rolloutPct: 10,
    });
    await svc.update({
      channel: 'beta',
      version: '1.0.5',
      buildId: 'new',
      url: 'https://e.com/n.zip',
      checksum: 'b'.repeat(64),
      size: 2,
      rolloutPct: 20,
    });
    expect(svc.get('beta')?.buildId).toBe('new');
    expect(svc.list()).toHaveLength(1);
  });

  it('clear() wipes both memory and db', async () => {
    await svc.onModuleInit();
    await svc.update({
      channel: 'beta',
      version: '1.0.5',
      buildId: 'x',
      url: 'https://e.com/x.zip',
      checksum: 'a'.repeat(64),
      size: 1,
      rolloutPct: 10,
    });
    await svc.clear();
    expect(svc.list()).toHaveLength(0);
    expect(svc.get('beta')).toBeUndefined();
    expect(fake.rows.size).toBe(0);
  });
});

describe('HMAC signature protocol (CI ↔ API)', () => {
  /**
   * Inline copy of the verifier in `live-updates.controller.ts`. Kept
   * separate so we can test it without spinning up the whole Nest
   * module. If the algorithm changes, BOTH this and the controller
   * must move together.
   */
  function verify(rawBody: string, header: string | undefined, secret: string): boolean {
    if (!header || !secret) return false;
    const m = /^sha256=([a-f0-9]{64})$/i.exec(header.trim());
    if (!m) return false;
    const { createHmac, timingSafeEqual } = require('node:crypto') as typeof import('node:crypto');
    const provided = Buffer.from(m[1], 'hex');
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  const sampleBody = JSON.stringify({
    channel: 'beta',
    version: '1.0.5',
    buildId: '1.0.5-abc123',
    url: 'https://pub.example.r2.dev/bundles/web-bundle-1.0.5-abc123.zip',
    checksum: 'd'.repeat(64),
    size: 1024,
    rolloutPct: 10,
  });

  it('accepts a correctly-signed payload', () => {
    const sig = sign(sampleBody);
    expect(verify(sampleBody, sig, SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verify(sampleBody, 'sha256=' + '0'.repeat(64), SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verify(sampleBody, undefined, SECRET)).toBe(false);
  });

  it('rejects a malformed signature header (wrong algo prefix)', () => {
    const sig = sign(sampleBody).replace('sha256=', 'sha1=');
    expect(verify(sampleBody, sig, SECRET)).toBe(false);
  });

  it('rejects a malformed signature header (non-hex)', () => {
    expect(verify(sampleBody, 'sha256=' + 'z'.repeat(64), SECRET)).toBe(false);
  });

  it('rejects when secret differs (server rotated)', () => {
    const sig = sign(sampleBody);
    expect(verify(sampleBody, sig, 'different-secret')).toBe(false);
  });

  it('rejects when payload byte differs by one character', () => {
    const sig = sign(sampleBody);
    const tampered = sampleBody.replace('1.0.5', '9.9.9');
    expect(verify(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects when payload has extra trailing newline (catches echo vs printf bug)', () => {
    // This is the exact regression the v1 of the workflow shipped:
    // signing via `echo -n` but POSTing via curl `-d "$PAYLOAD"` which
    // retains the YAML heredoc's trailing newline. The HMAC matches the
    // newline-stripped string but the rawBody has the extra byte, so
    // verification fails. We pin this so any future "make it forgiving"
    // patch is rejected (we WANT it strict — silent verifier bypasses
    // are worse than a noisy 401).
    const sig = sign(sampleBody);
    expect(verify(sampleBody + '\n', sig, SECRET)).toBe(false);
  });
});
