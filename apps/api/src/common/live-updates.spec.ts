import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { LiveUpdatesCacheService } from './live-updates-cache.service';

/**
 * Phase 19 — Unit tests for the OTA manifest webhook + cache pieces.
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

describe('LiveUpdatesCacheService', () => {
  let svc: LiveUpdatesCacheService;

  beforeEach(() => {
    svc = new LiveUpdatesCacheService();
  });

  it('returns undefined for missing channel', () => {
    expect(svc.get('production')).toBeUndefined();
  });

  it('stores and retrieves an override by channel', () => {
    const applied = svc.update({
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
  });

  it('keeps production and beta separate', () => {
    svc.update({
      channel: 'production',
      version: '1.0.4',
      buildId: 'prod-x',
      url: 'https://e.com/p.zip',
      checksum: 'b'.repeat(64),
      size: 100,
      rolloutPct: 100,
    });
    svc.update({
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
  });

  it('overwrites prior override for same channel', () => {
    svc.update({
      channel: 'beta',
      version: '1.0.4',
      buildId: 'old',
      url: 'https://e.com/o.zip',
      checksum: 'a'.repeat(64),
      size: 1,
      rolloutPct: 10,
    });
    svc.update({
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

  it('clear() wipes all overrides', () => {
    svc.update({
      channel: 'beta',
      version: '1.0.5',
      buildId: 'x',
      url: 'https://e.com/x.zip',
      checksum: 'a'.repeat(64),
      size: 1,
      rolloutPct: 10,
    });
    svc.clear();
    expect(svc.list()).toHaveLength(0);
    expect(svc.get('beta')).toBeUndefined();
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
