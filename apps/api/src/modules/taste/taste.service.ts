/**
 * Phase 10.2 — TasteService
 *
 * Builds and serves the "what is this user into?" snapshot
 * (`user_profiles` row) from the firehose (`user_events`).
 *
 *   Lifecycle:
 *     1. EventsService.ingestBatch() collects userIds touched in this batch
 *        and calls `taste.enqueue(userIds)` (non-blocking).
 *     2. TasteWorker drains the queue every WORKER_TICK_MS and calls
 *        `taste.rebuildFor(userId)` for each.
 *     3. RecommendationService.forYou2() calls `taste.get(userId)` once per
 *        request — read path is just a single PK lookup.
 *
 *   Cold-start fallback: if a user has fewer than COLD_START_MIN_EVENTS
 *   weighted events in their window, the profile is empty and the ranker
 *   falls back to legacy `forYou` (popularity + same-shop).
 *
 *   Decay: handled at *build time* — each event contributes
 *   `weight × exp(-age_in_days / HALF_LIFE_DAYS)` to the affinity vectors.
 *
 *   No external dependencies (no vector DB, no message queue). Everything
 *   runs in-process — fine up to ~1M weekly active users on commodity HW.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TasteProfileSummary,
  UserTasteProfile,
} from '../../shared/types';
import { tokenize } from '../../common/text/tfidf';

// ─── Tunables (env-overridable) ──────────────────────────────────────────
const HALF_LIFE_DAYS = Number(process.env.TASTE_HALF_LIFE_DAYS ?? 14);
const WINDOW_DAYS = Number(process.env.TASTE_WINDOW_DAYS ?? 30);
const COLD_START_MIN_EVENTS = Number(
  process.env.TASTE_COLD_START_MIN ?? 3,
);
// Max items in the recent-history vector — keeps the JSON small.
const MAX_RECENT_ITEMS = 30;
const MAX_TAGS = 80;
const MAX_SHOPS = 40;

// Per-event weights. Tweak these to push the model towards different goals
// (engagement, conversion, exploration). Negative = signal of dislike.
const EVENT_WEIGHTS: Record<string, number> = {
  reco_impression: 0.1,
  product_view: 1.0,
  product_scroll: 1.5,
  product_dwell: 2.5,
  reco_click: 1.8,
  search_click: 1.8,
  add_to_cart: 5.0,
  remove_from_cart: -2.0,
  wishlist_add: 4.0,
  wishlist_remove: -1.0,
  shop_view: 0.8,
  follow_shop: 6.0,
  purchase: 25.0,
};

interface DbEventRow {
  kind: string;
  entityType: string | null;
  entityId: string | null;
  metaJson: string;
  ts: string; // ISO string from SQLite
}

interface DbProductMetaRow {
  id: string;
  shopId: string;
  shopName: string | null;
  name: string;
  description: string | null;
  priceCents: number;
}

interface DbProfileRow {
  userId: string;
  shopAffinityJson: string;
  tagAffinityJson: string;
  priceMedianCents: number;
  priceStdCents: number;
  recentItemIdsJson: string;
  boughtItemIdsJson: string;
  eventCount: number;
  windowDays: number;
  generation: number;
  lastUpdatedAt: string;
}

@Injectable()
export class TasteService {
  // In-process queue of userIds awaiting rebuild. TasteWorker drains it.
  private readonly queue = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────────────
  // Worker hooks
  // ────────────────────────────────────────────────────────────────────

  enqueue(userIds: Iterable<string>): void {
    for (const id of userIds) {
      if (id) this.queue.add(id);
    }
  }

  /** Drain up to `max` userIds — called by TasteWorker every tick. */
  takeBatch(max = 50): string[] {
    const out: string[] = [];
    const it = this.queue.values();
    for (let i = 0; i < max; i++) {
      const next = it.next();
      if (next.done) break;
      out.push(next.value);
      this.queue.delete(next.value);
    }
    return out;
  }

  queueSize(): number {
    return this.queue.size;
  }

  // ────────────────────────────────────────────────────────────────────
  // Read API
  // ────────────────────────────────────────────────────────────────────

  async get(userId: string): Promise<UserTasteProfile | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT userId, shopAffinityJson, tagAffinityJson,
              priceMedianCents, priceStdCents,
              recentItemIdsJson, boughtItemIdsJson,
              eventCount, windowDays, generation, lastUpdatedAt
       FROM user_profiles WHERE userId = ? LIMIT 1`,
      userId,
    )) as DbProfileRow[];
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.userId,
      shopAffinity: safeJson<Record<string, number>>(
        row.shopAffinityJson,
        {},
      ),
      tagAffinity: safeJson<Record<string, number>>(
        row.tagAffinityJson,
        {},
      ),
      priceMedianCents: row.priceMedianCents,
      priceStdCents: row.priceStdCents,
      recentItemIds: safeJson<string[]>(row.recentItemIdsJson, []),
      boughtItemIds: safeJson<string[]>(row.boughtItemIdsJson, []),
      eventCount: row.eventCount,
      windowDays: row.windowDays,
      generation: row.generation,
      lastUpdatedAt: row.lastUpdatedAt,
    };
  }

  /** Compact human-readable summary used by the privacy page and admin. */
  async summary(userId: string): Promise<TasteProfileSummary | null> {
    const p = await this.get(userId);
    if (!p) {
      return {
        userId,
        isColdStart: true,
        eventCount: 0,
        lastUpdatedAt: new Date(0).toISOString(),
        topShops: [],
        topTags: [],
        priceMedianCents: 0,
        priceStdCents: 0,
        recentItemCount: 0,
      };
    }
    const topShopIds = Object.entries(p.shopAffinity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const shopNames =
      topShopIds.length > 0
        ? ((await this.prisma.$queryRawUnsafe(
            `SELECT id, name FROM shops WHERE id IN (${topShopIds.map(() => '?').join(',')})`,
            ...topShopIds.map(([id]) => id),
          )) as Array<{ id: string; name: string | null }>)
        : [];
    const nameById = new Map(shopNames.map((s) => [s.id, s.name ?? null]));
    const topTags = Object.entries(p.tagAffinity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([token, weight]) => ({ token, weight }));
    return {
      userId,
      isColdStart: p.eventCount < COLD_START_MIN_EVENTS,
      eventCount: p.eventCount,
      lastUpdatedAt: p.lastUpdatedAt,
      topShops: topShopIds.map(([shopId, weight]) => ({
        shopId,
        shopName: nameById.get(shopId) ?? null,
        weight,
      })),
      topTags,
      priceMedianCents: p.priceMedianCents,
      priceStdCents: p.priceStdCents,
      recentItemCount: p.recentItemIds.length,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Rebuild
  // ────────────────────────────────────────────────────────────────────

  /**
   * Recompute the user's profile from events within the rolling window.
   * Cheap enough to call directly from the worker tick.
   */
  async rebuildFor(userId: string): Promise<UserTasteProfile> {
    const since = isoDaysAgo(WINDOW_DAYS);
    const events = (await this.prisma.$queryRawUnsafe(
      `SELECT kind, entityType, entityId, metaJson, ts
       FROM user_events
       WHERE userId = ? AND ts >= ?
       ORDER BY ts DESC
       LIMIT 5000`,
      userId,
      since,
    )) as DbEventRow[];

    // Bought items (highest signal) — pulled separately because orders are
    // the source of truth, not the firehose (we should still learn from
    // historical buyers even if the firehose was just turned on).
    const boughtRows = (await this.prisma.$queryRawUnsafe(
      `SELECT DISTINCT p.id, p.shopId, p.priceCents
       FROM orders o
       JOIN order_items oi ON oi.orderId = o.id
       JOIN products p ON p.id = oi.productId
       WHERE o.customerId = ?
         AND o.status NOT IN ('CANCELLED')
       ORDER BY o.createdAt DESC
       LIMIT 200`,
      userId,
    )) as Array<{ id: string; shopId: string; priceCents: number }>;

    // Collect unique product IDs touched, then fetch their meta in one query
    const productIds = new Set<string>();
    for (const e of events) {
      if (e.entityType === 'product' && e.entityId) {
        productIds.add(e.entityId);
      }
    }
    for (const b of boughtRows) productIds.add(b.id);

    let metaById = new Map<string, DbProductMetaRow>();
    if (productIds.size > 0) {
      const idList = Array.from(productIds);
      const placeholders = idList.map(() => '?').join(',');
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT p.id, p.shopId, p.name, p.description, p.priceCents,
                s.name AS shopName
         FROM products p
         LEFT JOIN shops s ON s.id = p.shopId
         WHERE p.id IN (${placeholders})`,
        ...idList,
      )) as DbProductMetaRow[];
      metaById = new Map(rows.map((r) => [r.id, r] as const));
    }

    // ─── Aggregate signals ──────────────────────────────────────────
    const shopAff = new Map<string, number>();
    const tagAff = new Map<string, number>();
    const recent: string[] = [];
    const recentSet = new Set<string>();
    const prices: number[] = [];
    const now = Date.now();
    let weightedCount = 0;

    for (const e of events) {
      const w = EVENT_WEIGHTS[e.kind];
      if (w == null || w === 0) continue;
      const ageDays = (now - new Date(e.ts).getTime()) / (1000 * 86400);
      const decayed = w * Math.exp(-ageDays / HALF_LIFE_DAYS);
      weightedCount++;

      if (e.entityType === 'product' && e.entityId) {
        const meta = metaById.get(e.entityId);
        if (meta) {
          incr(shopAff, meta.shopId, decayed);
          const tokens = tokenize(
            `${meta.name} ${meta.description ?? ''}`,
          );
          for (const t of tokens) incr(tagAff, t, decayed);
          if (decayed > 0) prices.push(meta.priceCents);
          // dedup recent products — newest first (events are DESC by ts)
          if (!recentSet.has(e.entityId)) {
            recentSet.add(e.entityId);
            recent.push(e.entityId);
          }
        }
      } else if (e.entityType === 'shop' && e.entityId) {
        incr(shopAff, e.entityId, decayed);
      } else if (e.entityType === 'search' && e.kind === 'search_query') {
        // Fold search query tokens directly into the tag vector
        const q = readSearchQuery(e.metaJson);
        if (q) {
          for (const t of tokenize(q)) incr(tagAff, t, decayed);
        }
      }
    }

    // Bought items — strong, durable signal (not subject to firehose-age)
    for (const b of boughtRows) {
      const meta = metaById.get(b.id);
      if (!meta) continue;
      incr(shopAff, meta.shopId, EVENT_WEIGHTS.purchase ?? 25);
      const tokens = tokenize(`${meta.name} ${meta.description ?? ''}`);
      for (const t of tokens) incr(tagAff, t, EVENT_WEIGHTS.purchase ?? 25);
      prices.push(meta.priceCents);
    }

    // ─── Truncate and normalise ────────────────────────────────────
    const shopAffinity = topNObject(shopAff, MAX_SHOPS);
    const tagAffinity = topNObject(tagAff, MAX_TAGS);
    normalise(shopAffinity);
    normalise(tagAffinity);

    const { median, std } = priceStats(prices);

    const profile: UserTasteProfile = {
      userId,
      shopAffinity,
      tagAffinity,
      priceMedianCents: median,
      priceStdCents: std,
      recentItemIds: recent.slice(0, MAX_RECENT_ITEMS),
      boughtItemIds: boughtRows.map((b) => b.id).slice(0, MAX_RECENT_ITEMS),
      eventCount: weightedCount,
      windowDays: WINDOW_DAYS,
      generation: 0, // filled by upsert below
      lastUpdatedAt: new Date().toISOString(),
    };

    await this.upsert(profile);
    return profile;
  }

  private async upsert(p: UserTasteProfile): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO user_profiles (
         userId, shopAffinityJson, tagAffinityJson,
         priceMedianCents, priceStdCents,
         recentItemIdsJson, boughtItemIdsJson,
         eventCount, windowDays, generation, lastUpdatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(userId) DO UPDATE SET
         shopAffinityJson  = excluded.shopAffinityJson,
         tagAffinityJson   = excluded.tagAffinityJson,
         priceMedianCents  = excluded.priceMedianCents,
         priceStdCents     = excluded.priceStdCents,
         recentItemIdsJson = excluded.recentItemIdsJson,
         boughtItemIdsJson = excluded.boughtItemIdsJson,
         eventCount        = excluded.eventCount,
         windowDays        = excluded.windowDays,
         generation        = user_profiles.generation + 1,
         lastUpdatedAt     = CURRENT_TIMESTAMP`,
      p.userId,
      JSON.stringify(p.shopAffinity),
      JSON.stringify(p.tagAffinity),
      p.priceMedianCents,
      p.priceStdCents,
      JSON.stringify(p.recentItemIds),
      JSON.stringify(p.boughtItemIds),
      p.eventCount,
      p.windowDays,
    );
  }

  /** Wipe this user's profile (used by GDPR-style "delete my data"). */
  async deleteFor(userId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM user_profiles WHERE userId = ?`,
      userId,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function safeJson<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw) as T;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function incr(m: Map<string, number>, key: string, delta: number): void {
  m.set(key, (m.get(key) ?? 0) + delta);
}

function topNObject(
  m: Map<string, number>,
  n: number,
): Record<string, number> {
  const arr = Array.from(m.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  const out: Record<string, number> = {};
  for (const [k, v] of arr) out[k] = v;
  return out;
}

/** L1-normalise so the largest weight is 1 (keeps numbers comparable across users). */
function normalise(obj: Record<string, number>): void {
  const max = Math.max(0, ...Object.values(obj));
  if (max <= 0) return;
  for (const k of Object.keys(obj)) obj[k] = obj[k]! / max;
}

function priceStats(prices: number[]): { median: number; std: number } {
  if (prices.length === 0) return { median: 0, std: 0 };
  const sorted = [...prices].sort((a, b) => a - b);
  const median =
    sorted[Math.floor(sorted.length / 2)] ?? 0;
  const mean = prices.reduce((s, x) => s + x, 0) / prices.length;
  const variance =
    prices.reduce((s, x) => s + (x - mean) ** 2, 0) / prices.length;
  return { median, std: Math.round(Math.sqrt(variance)) };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400 * 1000).toISOString();
}

function readSearchQuery(metaJson: string): string | null {
  try {
    const obj = JSON.parse(metaJson) as { query?: unknown; q?: unknown };
    if (typeof obj.query === 'string') return obj.query;
    if (typeof obj.q === 'string') return obj.q;
    return null;
  } catch {
    return null;
  }
}
