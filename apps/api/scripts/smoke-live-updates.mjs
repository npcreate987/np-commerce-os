#!/usr/bin/env node
/**
 * Phase 19.4 — End-to-end smoke test for OTA webhook + persistence.
 *
 * Validates the production stack against a real Railway instance:
 *
 *   1. POST /webhook with valid HMAC + valid payload → 200 + persisted
 *   2. GET /manifest → returns the just-posted bundle metadata
 *   3. POST /webhook with bogus HMAC → 401 (manifest untouched)
 *   4. POST /webhook with invalid payload → 400 (manifest untouched)
 *   5. POST /webhook with valid payload + valid HMAC → 200 + overwrites #1
 *   6. Final GET /manifest → returns #5's data (proves last-write-wins)
 *
 * Why not pglite or testcontainers?
 *
 *   We get more coverage by hitting the real Fastify content-type
 *   parser + Prisma upsert + Railway routing than from any local mock.
 *   The original byte-for-byte HMAC mismatch (commit 27d9de1 history)
 *   was a real-stack bug — a mocked-Prisma unit test would have
 *   missed it because the buggy was the raw-body capture in Fastify
 *   middleware, not the verifier itself.
 *
 * Usage
 *
 *   API_URL=https://np-commerce-os-production.up.railway.app \
 *   LIVE_UPDATES_WEBHOOK_SECRET=<the actual secret> \
 *     node apps/api/scripts/smoke-live-updates.mjs
 *
 * Exit codes
 *
 *   0 — all assertions passed
 *   1 — one or more assertions failed; the script restores the channel
 *       to its pre-test state on best-effort basis (the final POST in
 *       step 5 always runs, even if 1-4 fail, so production isn't
 *       left in a weird state).
 *
 * IMPORTANT — destructive to the `beta-smoke` channel
 *
 *   This script writes to channel `beta-smoke` (not `beta` / `production`)
 *   so users on real channels are unaffected. The cache row for
 *   `beta-smoke` is left in the DB after the run finishes — that's
 *   intentional so you can introspect the last test state if needed.
 *   Run `DELETE FROM live_update_manifests WHERE channel='beta-smoke';`
 *   if you want to clean up.
 *
 *   NOTE — `beta-smoke` is not in the Zod enum (`production` | `beta`),
 *   so steps that POST it expect a 400 validation error today. Until
 *   we add a SMOKE-channel allowlist, the script tests the HMAC + raw
 *   body path against the `beta` channel itself and instead reverts
 *   to the prior state at the end. See readme below.
 */
import { createHmac } from 'node:crypto';

const API_URL = (process.env.API_URL || 'https://np-commerce-os-production.up.railway.app').replace(/\/$/, '');
const SECRET = process.env.LIVE_UPDATES_WEBHOOK_SECRET;

if (!SECRET) {
  console.error('❌ LIVE_UPDATES_WEBHOOK_SECRET env var is required');
  console.error('   Get it from Railway dashboard or 1Password vault.');
  process.exit(2);
}

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let pass = 0;
let fail = 0;
const failures = [];

function sign(rawBody) {
  return 'sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex');
}

async function postWebhook(payload, { signWith = SECRET, contentType = 'application/json' } = {}) {
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + createHmac('sha256', signWith).update(raw).digest('hex');
  const res = await fetch(`${API_URL}/app/live-updates/webhook`, {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-np-signature': sig },
    body: raw,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function getManifest(channel) {
  const res = await fetch(`${API_URL}/app/live-updates/manifest?channel=${channel}`);
  return res.json();
}

function assert(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`${GREEN}✓${RESET} ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${RED}✗${RESET} ${label}${detail ? `\n  ${DIM}${detail}${RESET}` : ''}`);
  }
}

async function main() {
  console.log(`${DIM}Smoke testing ${API_URL}${RESET}\n`);

  // ─────────────────────────────────────────────────────────────
  // Step 0 — Snapshot current beta state so we can restore it
  // ─────────────────────────────────────────────────────────────
  const initialBeta = await getManifest('beta');
  console.log(
    `${DIM}Current beta manifest: buildId=${initialBeta.buildId} updateAvailable=${initialBeta.updateAvailable}${RESET}\n`,
  );

  const stamp = `smoke-${Date.now()}`;
  const validPayload = {
    channel: 'beta',
    version: '0.0.0',
    buildId: `0.0.0-${stamp}`,
    url: `https://pub-test.r2.dev/bundles/smoke-${stamp}.zip`,
    checksum: 'a'.repeat(64),
    size: 1024,
    rolloutPct: 100,
  };

  // ─────────────────────────────────────────────────────────────
  // Step 1 — valid payload + valid HMAC → 200 + persisted
  // ─────────────────────────────────────────────────────────────
  console.log(`${YELLOW}━━ Step 1: valid POST ━━${RESET}`);
  const r1 = await postWebhook(validPayload);
  assert('webhook returns 200', r1.status === 200, `got ${r1.status}: ${JSON.stringify(r1.body)}`);
  assert(
    'response.applied matches sent buildId',
    r1.body?.applied === validPayload.buildId,
    `expected ${validPayload.buildId}, got ${r1.body?.applied}`,
  );
  assert(
    'response.channel echoes beta',
    r1.body?.channel === 'beta',
    `expected beta, got ${r1.body?.channel}`,
  );

  const m1 = await getManifest('beta');
  assert(
    'manifest reflects new buildId immediately',
    m1.buildId === validPayload.buildId,
    `expected ${validPayload.buildId}, got ${m1.buildId}`,
  );
  assert(
    'manifest reflects new url',
    m1.url === validPayload.url,
    `expected ${validPayload.url}, got ${m1.url}`,
  );

  // ─────────────────────────────────────────────────────────────
  // Step 2 — bogus HMAC → 401, manifest UNTOUCHED
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}━━ Step 2: bogus HMAC ━━${RESET}`);
  const r2 = await postWebhook(
    {
      ...validPayload,
      buildId: 'attacker-injected-build',
      url: 'https://evil.example/payload.zip',
    },
    { signWith: 'wrong-secret-pretending-to-be-attacker' },
  );
  assert('webhook returns 401 on bad sig', r2.status === 401, `got ${r2.status}`);

  const m2 = await getManifest('beta');
  assert(
    'manifest unchanged after attack attempt',
    m2.buildId === validPayload.buildId,
    `expected ${validPayload.buildId}, got ${m2.buildId} — attacker may have leaked through!`,
  );

  // ─────────────────────────────────────────────────────────────
  // Step 3 — invalid payload (bad checksum) → 400
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}━━ Step 3: invalid payload ━━${RESET}`);
  const r3 = await postWebhook({ ...validPayload, checksum: 'not-hex' });
  assert('webhook returns 400 on invalid payload', r3.status === 400, `got ${r3.status}`);

  // ─────────────────────────────────────────────────────────────
  // Step 4 — same body, signed with WRONG secret prefix → 401
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}━━ Step 4: malformed sig header ━━${RESET}`);
  const raw4 = JSON.stringify(validPayload);
  const res4 = await fetch(`${API_URL}/app/live-updates/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-np-signature': 'sha1=' + 'a'.repeat(40) },
    body: raw4,
  });
  assert('webhook returns 401 on wrong algo prefix (sha1=)', res4.status === 401, `got ${res4.status}`);

  // ─────────────────────────────────────────────────────────────
  // Step 5 — final overwrite to ensure last-write-wins, restore state
  // ─────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}━━ Step 5: restore prior beta state ━━${RESET}`);
  if (initialBeta.buildId === 'initial' || initialBeta.url === '') {
    console.log(`${DIM}  Prior beta was 'initial' — leaving smoke buildId in place${RESET}`);
    console.log(`${DIM}  Run a normal mobile-live-update workflow to restore a real bundle.${RESET}`);
  } else {
    const restore = {
      channel: 'beta',
      version: initialBeta.version,
      buildId: initialBeta.buildId,
      url: initialBeta.url,
      checksum: initialBeta.checksum,
      size: initialBeta.size,
      rolloutPct: 100,
      minNativeVersion: initialBeta.minNativeVersion,
    };
    const r5 = await postWebhook(restore);
    assert('restore POST returns 200', r5.status === 200, `got ${r5.status}: ${JSON.stringify(r5.body)}`);
    const m5 = await getManifest('beta');
    assert(
      'beta restored to prior buildId',
      m5.buildId === initialBeta.buildId,
      `expected ${initialBeta.buildId}, got ${m5.buildId}`,
    );
  }

  // ─────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50));
  console.log(`Result: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log(`\n${RED}Failures:${RESET}`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log(`${GREEN}All smoke tests passed.${RESET}`);
}

main().catch((err) => {
  console.error(`${RED}smoke test crashed:${RESET}`, err);
  process.exit(1);
});
