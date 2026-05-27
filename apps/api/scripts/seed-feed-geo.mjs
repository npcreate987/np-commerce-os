#!/usr/bin/env node
/**
 * Phase 19.7 — Smoke / demo seed for the proximity-ranked video feed.
 *
 * Spins up 5 creators each with a shop, then drops one video per creator.
 * Four shops get a `LocalStore` row at varying distances from Siam Square
 * (the user's "home" pin for verification); the fifth is intentionally
 * left non-local so we can prove that tier-2 fallback still surfaces it.
 *
 * Why through the HTTP API and not Prisma directly?
 *   - The Railway database is not reachable from this laptop (no public
 *     `pg://` URL is published).
 *   - All endpoints we need (signup, shop, product, local-store upsert,
 *     video create) already exist and use the same validation paths that
 *     production traffic uses — so seeding through them doubles as a
 *     real-world API smoke test of the freshly-deployed code.
 *
 * Idempotency: each creator's slug + email is stable so a second run will
 * skip signup (409 → login fallback) and re-use the same shop. Videos are
 * always created fresh; the script prints the IDs so they can be deleted
 * later via `DELETE /feed/:id`.
 *
 *   Usage:
 *     API_URL=https://np-commerce-os-production.up.railway.app \
 *       node apps/api/scripts/seed-feed-geo.mjs
 *
 *   Optional:
 *     ANCHOR_LAT=13.7456 ANCHOR_LNG=100.5340  # default = Siam Square
 *     VERIFY_ONLY=true                          # skip seed, just call /feed
 */

const API_URL = process.env.API_URL || 'https://np-commerce-os-production.up.railway.app';
const ANCHOR_LAT = Number(process.env.ANCHOR_LAT ?? '13.7456');
const ANCHOR_LNG = Number(process.env.ANCHOR_LNG ?? '100.5340');
const VERIFY_ONLY = (process.env.VERIFY_ONLY ?? 'false').toLowerCase() === 'true';

// Distance from Siam Square (per https://www.google.com/maps measurements):
//   Siam Paragon → 13.7456, 100.5340
//   Asoke Junction → 13.7374, 100.5604  (~2.9 km E)
//   Bang Sue → 13.8019, 100.5380         (~6.3 km N)
//   Chiang Mai Old City → 18.7883, 98.9853 (~688 km NW — guaranteed tier-2)
const SEEDS = [
  {
    key: 'siam',
    email: 'creator-siam@np.dev',
    name: 'Mai Siam',
    shopSlug: 'siam-bites-19-7',
    shopName: 'Siam Bites',
    productName: 'ลาบหมูคั่ว Siam Bites',
    priceCents: 8900,
    caption: 'ลาบหมูคั่วในซอย จากร้านที่อยู่กลางสยามจริงๆ',
    local: { lat: 13.7456, lng: 100.5340, addressText: 'สยามสแควร์ ซอย 7', kind: 'RESTAURANT' },
  },
  {
    key: 'asoke',
    email: 'creator-asoke@np.dev',
    name: 'Pim Asoke',
    shopSlug: 'asoke-fresh-19-7',
    shopName: 'Asoke Fresh',
    productName: 'น้ำมะนาวคั้นสด',
    priceCents: 5500,
    caption: 'น้ำมะนาวสด คั้นทุกแก้ว — รับที่หน้าร้านในอโศก',
    local: { lat: 13.7374, lng: 100.5604, addressText: 'อโศก ติด BTS', kind: 'CAFE' },
  },
  {
    key: 'bangsue',
    email: 'creator-bangsue@np.dev',
    name: 'Tan Bang Sue',
    shopSlug: 'bangsue-market-19-7',
    shopName: 'Bang Sue Market',
    productName: 'ส้มตำปูปลาร้า',
    priceCents: 7000,
    caption: 'ส้มตำปูปลาร้า สูตรอีสาน ส่งเดลิเวอรี่รัศมี 5 กม.',
    local: { lat: 13.8019, lng: 100.5380, addressText: 'ตลาดบางซื่อ', kind: 'FRESH_MARKET' },
  },
  {
    key: 'chiangmai',
    email: 'creator-cm@np.dev',
    name: 'Aim CM',
    shopSlug: 'cm-craft-19-7',
    shopName: 'CM Craft',
    productName: 'หัตถกรรมเชียงใหม่',
    priceCents: 35000,
    caption: 'งานหัตถกรรมเชียงใหม่ — ส่งทั่วประเทศ',
    local: { lat: 18.7883, lng: 98.9853, addressText: 'ถนนคนเดินวันอาทิตย์', kind: 'LOCAL_GOODS' },
  },
  {
    key: 'online-only',
    email: 'creator-online@np.dev',
    name: 'Online Joy',
    shopSlug: 'joy-dropship-19-7',
    shopName: 'Joy Dropship',
    productName: 'เคสมือถือใส กันรอย',
    priceCents: 19900,
    caption: 'ส่งทั่วประเทศ ผ่านขนส่ง — ไม่มีหน้าร้าน',
    local: null, // intentionally non-local
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Phase 19.7 device-side demo — three shops within ~10 km of the dev
  // device's actual location (NE Thailand, ~16.5 N / 103.5 E) so a near-me
  // sort actually returns near-me clips on the test phone. Bangkok-based
  // users still see the Siam/Asoke/Bang Sue cluster as tier-1.
  // ─────────────────────────────────────────────────────────────────────────
  // Three shops within ~5 km of the test device (Khon Kaen, ~16.44 N /
  // 102.88 E). Production users in Bangkok still see the Siam cluster first.
  {
    key: 'kk-noodle',
    email: 'creator-kk-noodle@np.dev',
    name: 'นู๋นา ขอนแก่น',
    shopSlug: 'kk-noodle-19-7',
    shopName: 'ขอนแก่นก๋วยเตี๋ยวเรือ',
    productName: 'ก๋วยเตี๋ยวเรือต้มยำ',
    priceCents: 5500,
    caption: 'ก๋วยเตี๋ยวเรือต้มยำหม้อใหญ่ — รับที่ร้านในเมืองขอนแก่น',
    local: { lat: 16.4400, lng: 102.8800, addressText: 'ตลาดบางลำพู ขอนแก่น', kind: 'RESTAURANT' },
  },
  {
    key: 'kk-cafe',
    email: 'creator-kk-cafe@np.dev',
    name: 'เอม คาเฟ่ขอนแก่น',
    shopSlug: 'kk-cafe-19-7',
    shopName: 'KK Slow Bar',
    productName: 'กาแฟดริปดอยช้าง',
    priceCents: 7500,
    caption: 'กาแฟดริปดอยช้าง สด ๆ จากร้านในซอย ขอนแก่น',
    local: { lat: 16.4500, lng: 102.8350, addressText: 'ซอยข้างศาลากลาง', kind: 'CAFE' },
  },
  {
    key: 'kk-craft',
    email: 'creator-kk-craft@np.dev',
    name: 'ลุงสมชาย ผ้าฝ้าย',
    shopSlug: 'kk-craft-19-7',
    shopName: 'KK Cotton Craft',
    productName: 'ผ้าฝ้ายทอมือ ผืนใหญ่',
    priceCents: 89000,
    caption: 'ผ้าฝ้ายทอมือ ย้อมครามธรรมชาติ — ทอเอง ขายเอง ขอนแก่น',
    local: { lat: 16.4200, lng: 102.9100, addressText: 'หมู่บ้านโนนสวรรค์', kind: 'LOCAL_GOODS' },
  },
];

// Sample free-stock MP4 (BigBuckBunny is the universally-CDNed clip with CORS-OK).
// We use the same URL for every video; the feed cares about ordering, not content.
const SAMPLE_VIDEO =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const SAMPLE_THUMB = 'https://picsum.photos/seed/np-feed-geo/480/854';

// =============================================================================
// HTTP helpers
// =============================================================================

async function call(method, path, opts = {}) {
  const { token, body } = opts;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

// =============================================================================
// Seed steps
// =============================================================================

async function ensureCreator(seed) {
  // Try signup; if 409 fall back to login. Either way we want a fresh JWT.
  let r = await call('POST', '/auth/signup', {
    body: { email: seed.email, name: seed.name, password: 'password123' },
  });
  if (r.status === 201 || r.status === 200) {
    return { token: r.body.accessToken ?? r.body.token, userId: r.body.user?.id };
  }
  if (r.status === 409) {
    r = await call('POST', '/auth/login', {
      body: { email: seed.email, password: 'password123' },
    });
    if (r.status === 200 || r.status === 201) {
      return { token: r.body.accessToken ?? r.body.token, userId: r.body.user?.id };
    }
  }
  throw new Error(`signup/login failed for ${seed.email}: ${r.status} ${JSON.stringify(r.body)}`);
}

async function ensureShop(seed, token) {
  // POST /shops returns 409 on duplicate slug — in that case fetch by slug.
  let r = await call('POST', '/shops', {
    token,
    body: { name: seed.shopName, slug: seed.shopSlug, description: seed.caption },
  });
  if (r.status === 201 || r.status === 200) return r.body;
  if (r.status === 409) {
    const found = await call('GET', `/shops/${seed.shopSlug}`);
    if (found.status === 200) return found.body;
  }
  throw new Error(`shop create failed for ${seed.shopSlug}: ${r.status} ${JSON.stringify(r.body)}`);
}

async function ensureProduct(seed, shopId, token) {
  // No "find by name" endpoint, but /products/shop/:shopId/list exists.
  const listed = await call('GET', `/products/shop/${shopId}/list`, { token });
  if (listed.status === 200 && Array.isArray(listed.body)) {
    const hit = listed.body.find((p) => p.name === seed.productName);
    if (hit) return hit;
  }
  const r = await call('POST', `/products/shop/${shopId}`, {
    token,
    body: {
      name: seed.productName,
      description: seed.caption,
      priceCents: seed.priceCents,
      stock: 99,
      media: 'https://picsum.photos/seed/np-feed-prod/600/600',
    },
  });
  if (r.status === 201 || r.status === 200) return r.body;
  throw new Error(`product create failed: ${r.status} ${JSON.stringify(r.body)}`);
}

async function ensureLocalStore(seed, shopId, token) {
  if (!seed.local) return null;
  const r = await call('PUT', `/local/shops/${shopId}`, {
    token,
    body: {
      kind: seed.local.kind,
      lat: seed.local.lat,
      lng: seed.local.lng,
      addressText: seed.local.addressText,
      deliveryRadiusKm: 5,
      pickupEnabled: true,
      deliveryEnabled: true,
      prepTimeMinutes: 20,
      openHours: {},
      active: true,
      baseDeliveryCents: 3500,
      perKmCents: 800,
    },
  });
  if (r.status === 200 || r.status === 201) return r.body;
  throw new Error(`local-store upsert failed for ${seed.key}: ${r.status} ${JSON.stringify(r.body)}`);
}

async function postVideo(seed, shopId, productId, token) {
  const r = await call('POST', '/feed', {
    token,
    body: {
      videoUrl: SAMPLE_VIDEO,
      thumbUrl: SAMPLE_THUMB,
      caption: seed.caption,
      productId,
      shopId,
      tags: ['near-me', 'demo', seed.key],
    },
  });
  if (r.status === 201 || r.status === 200) return r.body;
  throw new Error(`video create failed for ${seed.key}: ${r.status} ${JSON.stringify(r.body)}`);
}

// =============================================================================
// Verify
// =============================================================================

async function verifyFeed() {
  console.log('\n=== Verify /feed (no geo) — score order ===');
  const r1 = await call('GET', '/feed?limit=10');
  if (r1.status !== 200) throw new Error(`/feed no-geo HTTP ${r1.status}`);
  console.log(
    r1.body.map((v, i) => `  ${i + 1}. ${v.caption.slice(0, 40)} (score=${v.score})`).join('\n') ||
      '  (empty)',
  );

  console.log(`\n=== Verify /feed?lat=${ANCHOR_LAT}&lng=${ANCHOR_LNG} (Siam) — near-me first ===`);
  const r2 = await call('GET', `/feed?lat=${ANCHOR_LAT}&lng=${ANCHOR_LNG}&limit=10`);
  if (r2.status !== 200) throw new Error(`/feed geo HTTP ${r2.status}`);
  console.log(
    r2.body
      .map((v, i) => {
        const d =
          v.distanceKm == null
            ? '(non-local)'
            : v.distanceKm < 1
              ? `${Math.round(v.distanceKm * 1000)} m`
              : `${v.distanceKm.toFixed(1)} km`;
        return `  ${i + 1}. [${d}] ${v.shopName ?? '?'} — ${v.caption.slice(0, 35)}`;
      })
      .join('\n') || '  (empty)',
  );

  // Sanity: tier-1 (≤25 km) must precede tier-2 (>25 km or null distance).
  let sawFar = false;
  let valid = true;
  for (const v of r2.body) {
    const isNear = v.distanceKm !== null && v.distanceKm <= 25;
    if (!isNear) sawFar = true;
    if (sawFar && isNear) {
      valid = false;
      break;
    }
  }
  console.log(valid ? '\n✅ Tier ordering correct (near first, far after).' : '\n❌ Tier ordering BROKEN');
  return valid;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log(`API: ${API_URL}`);
  const health = await call('GET', '/health');
  console.log(`Health: ${health.status} bootedAt=${health.body?.bootedAt} uptime=${health.body?.uptimeSec}s`);

  if (!VERIFY_ONLY) {
    console.log('\n=== Seeding ===');
    for (const seed of SEEDS) {
      console.log(`\n→ ${seed.key} (${seed.shopName})`);
      const { token, userId } = await ensureCreator(seed);
      console.log(`  user=${userId?.slice(0, 8)} authed`);
      const shop = await ensureShop(seed, token);
      console.log(`  shop=${shop.id?.slice(0, 8)} (${shop.slug})`);
      const product = await ensureProduct(seed, shop.id, token);
      console.log(`  product=${product.id?.slice(0, 8)}`);
      const ls = await ensureLocalStore(seed, shop.id, token);
      console.log(
        ls
          ? `  local=${ls.id?.slice(0, 8)} @ ${ls.lat.toFixed(3)},${ls.lng.toFixed(3)}`
          : '  local=skipped (non-local shop)',
      );
      const video = await postVideo(seed, shop.id, product.id, token);
      console.log(`  video=${video.id?.slice(0, 8)} ✓`);
    }
  } else {
    console.log('\n(VERIFY_ONLY=true → skipping seed)');
  }

  const ok = await verifyFeed();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('\n!!! Seed failed:', e.message);
  process.exit(2);
});
