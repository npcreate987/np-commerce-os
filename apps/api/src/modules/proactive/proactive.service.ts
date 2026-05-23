/**
 * Phase 10.3 — ProactiveService
 *
 * The "spotlight" layer: given the firehose (10.1) + taste profile (10.2),
 * decide what to *push* in front of the user without being asked.
 *
 * Two surfaces:
 *
 *   1. **Personalised feed rails** — server-driven shelves on the home feed
 *      (`recentlyViewed`, `favShopsNew`, `bargainsFromBrowse`, `similarToRecent`).
 *      Pure read APIs, no notifications fired.
 *
 *   2. **Outbound nudges** — sweepers run on a cron and trigger
 *      `NotificationService` for things like "you viewed X 3 times — still
 *      interested?" or "the shop you like just dropped a new item".
 *      Idempotency: every send is logged to `proactive_nudges` with a
 *      cooldown window — we never spam the same user with the same nudge.
 *
 * Design constraints:
 *   - No new behavioural collection — everything is derived from existing tables.
 *   - Respect privacy: `ConsentService.isBehavioralOptedOut(userId)` short-circuits
 *     the entire pipeline (no learning, no nudging).
 *   - Respect notification preferences: pushes go through `NotificationService`
 *     which already honours per-channel/per-topic opt-out from Phase 9.1.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../integration/notification.service';
import { ConsentService } from '../events/consent.service';
import { TasteService } from '../taste/taste.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import {
  FeedRail,
  NudgeKind,
  ProactiveBar,
  ProductRecommendation,
  SweepReport,
} from '../../shared/types';
import { tokenize } from '../../common/text/tfidf';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

interface CooldownMap {
  [kind: string]: number;
}

// Per-nudge-kind dedupe cooldown (hours). Users get *at most* one of each
// kind per window per entity. Tuned conservatively — proactive ≠ spam.
const DEFAULT_COOLDOWN_HOURS: CooldownMap = {
  BROWSE_ABANDON: 48,
  CART_ABANDON: 48,
  WIN_BACK: 168, // weekly
  PRICE_DROP: 72,
  FAV_SHOP_NEW_ARRIVAL: 168,
  BACK_IN_STOCK: 24,
};

@Injectable()
export class ProactiveService {
  private readonly logger = new Logger(ProactiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly consent: ConsentService,
    private readonly taste: TasteService,
    private readonly recs: RecommendationService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // PROACTIVE BAR — small context object the UI/chatbot uses to act on
  // "what is the user doing right now?"
  // ────────────────────────────────────────────────────────────────────

  async proactiveBar(userId: string): Promise<ProactiveBar> {
    // Last product / shop / search query the user touched
    const recentEvents = (await this.prisma.$queryRawUnsafe(
      `SELECT kind, entityType, entityId, metaJson
       FROM user_events
       WHERE userId = ?
         AND kind IN ('product_view','shop_view','search_query')
       ORDER BY ts DESC
       LIMIT 30`,
      userId,
    )) as Array<{
      kind: string;
      entityType: string | null;
      entityId: string | null;
      metaJson: string;
    }>;

    let lastProduct: string | null = null;
    let lastShop: string | null = null;
    let lastQuery: string | null = null;
    for (const e of recentEvents) {
      if (!lastProduct && e.kind === 'product_view' && e.entityId) {
        lastProduct = e.entityId;
      }
      if (!lastShop && e.kind === 'shop_view' && e.entityId) {
        lastShop = e.entityId;
      }
      if (!lastQuery && e.kind === 'search_query') {
        try {
          const parsed = JSON.parse(e.metaJson) as { query?: string; q?: string };
          lastQuery = parsed.query ?? parsed.q ?? null;
        } catch {
          /* ignore */
        }
      }
      if (lastProduct && lastShop && lastQuery) break;
    }

    // Pending in-app nudges sent in last 72h that the user hasn't dismissed
    // (we don't track dismissal yet — placeholder for future click-feedback)
    const pendingRows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM proactive_nudges
       WHERE userId = ?
         AND channel = 'INAPP'
         AND sentAt >= datetime('now','-3 days')`,
      userId,
    )) as Array<{ c: number }>;

    return {
      currentlyViewingProductId: lastProduct,
      lastSearchQuery: lastQuery,
      lastShopId: lastShop,
      pendingNudgeCount: Number(pendingRows[0]?.c ?? 0),
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // FEED RAILS — read-only personalised shelves
  // ────────────────────────────────────────────────────────────────────

  /** Bundle of all rails for a user — fewer round-trips from the client. */
  async homeRails(userId: string, limit = 10): Promise<FeedRail[]> {
    if (await this.consent.isBehavioralOptedOut(userId)) return [];

    // Run rails in parallel; each rail tolerates empty results
    const [recently, fav, bargains, similar] = await Promise.all([
      this.railRecentlyViewed(userId, limit),
      this.railFavShopsNew(userId, limit),
      this.railBargainsFromBrowse(userId, limit),
      this.railSimilarToRecent(userId, limit),
    ]);

    const out: FeedRail[] = [];
    if (recently.length) {
      out.push({
        kind: 'RECENTLY_VIEWED',
        title: 'เพิ่งดูล่าสุด',
        caption: 'กลับไปดูที่คุณเปิดไว้',
        items: recently,
      });
    }
    if (fav.length) {
      out.push({
        kind: 'FAV_SHOPS_NEW',
        title: 'ร้านโปรดมีของใหม่',
        caption: 'ของใหม่จากร้านที่คุณดูบ่อย',
        items: fav,
      });
    }
    if (bargains.length) {
      out.push({
        kind: 'BARGAINS_FROM_BROWSE',
        title: 'ลดราคาในของที่คุณดู',
        caption: 'อันที่ราคาดีลงมาในงบที่คุณชอบ',
        items: bargains,
      });
    }
    if (similar.length) {
      out.push({
        kind: 'SIMILAR_TO_RECENT',
        title: 'คล้ายที่คุณเพิ่งดู',
        caption: 'อิงจากสินค้าที่คุณเปิดล่าสุด',
        items: similar,
      });
    }
    return out;
  }

  async railRecentlyViewed(
    userId: string,
    limit = 10,
  ): Promise<ProductRecommendation[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.shopId, p.name, p.priceCents, s.name AS shopName,
              MAX(e.ts) AS lastSeen
       FROM user_events e
       JOIN products p ON p.id = e.entityId
       LEFT JOIN shops s ON s.id = p.shopId
       WHERE e.userId = ?
         AND e.entityType = 'product'
         AND e.kind = 'product_view'
         AND p.status = 'ACTIVE'
       GROUP BY p.id
       ORDER BY lastSeen DESC
       LIMIT ?`,
      userId,
      Math.max(1, Math.min(limit, 20)),
    )) as Array<{
      id: string;
      shopId: string;
      name: string;
      priceCents: number;
      shopName: string | null;
      lastSeen: string;
    }>;

    return rows.map((r) => ({
      productId: r.id,
      name: r.name,
      priceCents: r.priceCents,
      thumbUrl: null,
      shopId: r.shopId,
      shopName: r.shopName,
      score: 1,
      reason: 'BECAUSE_VIEWED' as const,
      reasonText: 'คุณเพิ่งเปิดดู',
    }));
  }

  async railFavShopsNew(
    userId: string,
    limit = 10,
  ): Promise<ProductRecommendation[]> {
    const profile = await this.taste.get(userId);
    if (!profile) return [];
    const topShops = Object.entries(profile.shopAffinity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    if (topShops.length === 0) return [];

    const placeholders = topShops.map(() => '?').join(',');
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.shopId, p.name, p.priceCents, s.name AS shopName
       FROM products p
       LEFT JOIN shops s ON s.id = p.shopId
       WHERE p.shopId IN (${placeholders})
         AND p.status = 'ACTIVE'
         AND p.createdAt >= date('now','-30 days')
       ORDER BY p.createdAt DESC
       LIMIT ?`,
      ...topShops,
      Math.max(1, Math.min(limit, 20)),
    )) as Array<{
      id: string;
      shopId: string;
      name: string;
      priceCents: number;
      shopName: string | null;
    }>;
    // Exclude items the user already viewed (we have a "recently viewed" rail for those)
    const viewed = new Set(profile.recentItemIds);
    return rows
      .filter((r) => !viewed.has(r.id))
      .map((r) => ({
        productId: r.id,
        name: r.name,
        priceCents: r.priceCents,
        thumbUrl: null,
        shopId: r.shopId,
        shopName: r.shopName,
        score: 1,
        reason: 'FAVOURITE_SHOP' as const,
        reasonText: `ใหม่จาก ${r.shopName ?? 'ร้านที่คุณดูบ่อย'}`,
      }));
  }

  async railBargainsFromBrowse(
    userId: string,
    limit = 10,
  ): Promise<ProductRecommendation[]> {
    const profile = await this.taste.get(userId);
    if (!profile || profile.recentItemIds.length === 0) return [];
    // Items the user viewed that today are priced below their personal median
    // (proxy for "looks like a deal for me")
    const median = Math.max(1, profile.priceMedianCents);
    const ids = profile.recentItemIds;
    const placeholders = ids.map(() => '?').join(',');
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.shopId, p.name, p.priceCents, s.name AS shopName
       FROM products p
       LEFT JOIN shops s ON s.id = p.shopId
       WHERE p.id IN (${placeholders})
         AND p.status = 'ACTIVE'
         AND p.priceCents <= ?
       ORDER BY p.priceCents ASC
       LIMIT ?`,
      ...ids,
      median,
      Math.max(1, Math.min(limit, 20)),
    )) as Array<{
      id: string;
      shopId: string;
      name: string;
      priceCents: number;
      shopName: string | null;
    }>;
    return rows.map((r) => ({
      productId: r.id,
      name: r.name,
      priceCents: r.priceCents,
      thumbUrl: null,
      shopId: r.shopId,
      shopName: r.shopName,
      score: 1,
      reason: 'PRICE_MATCH' as const,
      reasonText: 'ราคาดีในงบที่คุณชอบ',
    }));
  }

  /** Items similar to the most-recently-viewed product (collaborative). */
  async railSimilarToRecent(
    userId: string,
    limit = 10,
  ): Promise<ProductRecommendation[]> {
    const profile = await this.taste.get(userId);
    if (!profile || profile.recentItemIds.length === 0) return [];
    const seed = profile.recentItemIds[0];
    if (!seed) return [];
    try {
      return await this.recs.similar(seed, limit);
    } catch {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // OUTBOUND NUDGES — sweepers + dedupe
  // ────────────────────────────────────────────────────────────────────

  /** Has this nudge already been sent within the cooldown window? */
  private async wasRecentlyNudged(
    userId: string,
    kind: NudgeKind,
    entityId: string | null,
    cooldownHours: number,
  ): Promise<boolean> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT 1 AS x FROM proactive_nudges
       WHERE userId = ? AND kind = ?
         AND COALESCE(entityId,'') = COALESCE(?, '')
         AND sentAt >= datetime('now', ?)
       LIMIT 1`,
      userId,
      kind,
      entityId,
      `-${cooldownHours} hours`,
    )) as Array<{ x: number }>;
    return rows.length > 0;
  }

  private async recordNudge(
    userId: string,
    kind: NudgeKind,
    entityType: string | null,
    entityId: string | null,
    channel: string,
    payload: Record<string, unknown>,
    status: 'SENT' | 'SKIPPED' | 'FAILED',
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO proactive_nudges
        (id, userId, kind, entityType, entityId, channel, payloadJson, status, sentAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      newId('nudge'),
      userId,
      kind,
      entityType,
      entityId,
      channel,
      JSON.stringify(payload),
      status,
    );
  }

  /** Common "send + log" path used by every sweeper. */
  private async fireNudge(args: {
    userId: string;
    kind: NudgeKind;
    entityType: string | null;
    entityId: string | null;
    title: string;
    body: string;
    deepLink: string;
    payload: Record<string, unknown>;
  }): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
    if (await this.consent.isBehavioralOptedOut(args.userId)) return 'SKIPPED';
    const cooldownHours =
      DEFAULT_COOLDOWN_HOURS[args.kind] ?? 72;
    if (
      await this.wasRecentlyNudged(
        args.userId,
        args.kind,
        args.entityId,
        cooldownHours,
      )
    ) {
      return 'SKIPPED';
    }
    try {
      const results = await this.notifications.notifyUser(
        args.userId,
        'AUTO',
        'PROMOTIONAL',
        {
          title: args.title,
          body: args.body,
          url: args.deepLink,
          tag: `nudge:${args.kind.toLowerCase()}`,
          data: stringifyPayload({ nudgeKind: args.kind, ...args.payload }),
        },
      );
      const anyOk = results.some((r) => r.status === 'OK');
      const status = anyOk ? 'SENT' : 'FAILED';
      // Log in-app card on every fire (so the UI can show a "you have N
      // proactive things" badge even if push delivery failed).
      await this.recordNudge(
        args.userId,
        args.kind,
        args.entityType,
        args.entityId,
        'INAPP',
        {
          title: args.title,
          body: args.body,
          deepLink: args.deepLink,
          ...args.payload,
        },
        status,
      );
      return status;
    } catch (e) {
      this.logger.warn(
        `nudge fire failed (${args.kind}): ${(e as Error).message}`,
      );
      return 'FAILED';
    }
  }

  /** Browse-abandon: viewed product ≥ 3 times in 7d, no add_to_cart/purchase. */
  async sweepBrowseAbandon(): Promise<SweepReport> {
    const t0 = Date.now();
    const report: SweepReport = {
      kind: 'BROWSE_ABANDON',
      scanned: 0,
      matched: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
    };

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT userId, entityId AS productId, COUNT(*) AS views
       FROM user_events
       WHERE userId IS NOT NULL
         AND kind = 'product_view'
         AND entityType = 'product'
         AND ts >= datetime('now','-7 days')
       GROUP BY userId, entityId
       HAVING views >= 3`,
    )) as Array<{ userId: string; productId: string; views: number }>;
    report.scanned = rows.length;

    if (rows.length === 0) {
      report.durationMs = Date.now() - t0;
      return report;
    }

    // Exclude (userId, productId) pairs where the user already added-to-cart
    // or purchased — they're not abandoning, they converted.
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const placeholders = userIds.map(() => '?').join(',');
    const convRows = (await this.prisma.$queryRawUnsafe(
      `SELECT userId, entityId AS productId
       FROM user_events
       WHERE userId IN (${placeholders})
         AND kind IN ('add_to_cart','purchase')
         AND entityType = 'product'
         AND ts >= datetime('now','-7 days')`,
      ...userIds,
    )) as Array<{ userId: string; productId: string }>;
    const converted = new Set(
      convRows.map((r) => `${r.userId}|${r.productId}`),
    );

    const candidates = rows.filter(
      (r) => !converted.has(`${r.userId}|${r.productId}`),
    );
    report.matched = candidates.length;
    if (candidates.length === 0) {
      report.durationMs = Date.now() - t0;
      return report;
    }

    // Fetch product names for the body in one batch
    const pids = Array.from(new Set(candidates.map((c) => c.productId)));
    const productsRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, name FROM products WHERE id IN (${pids.map(() => '?').join(',')})`,
      ...pids,
    )) as Array<{ id: string; name: string }>;
    const nameById = new Map(productsRows.map((p) => [p.id, p.name]));

    for (const c of candidates) {
      const name = nameById.get(c.productId) ?? 'สินค้าชิ้นนี้';
      const status = await this.fireNudge({
        userId: c.userId,
        kind: 'BROWSE_ABANDON',
        entityType: 'product',
        entityId: c.productId,
        title: 'ยังสนใจอยู่ไหม?',
        body: `คุณเข้าดู "${truncate(name, 40)}" ไป ${c.views} ครั้งแล้วนะ`,
        deepLink: `/product/${c.productId}`,
        payload: { views: c.views },
      });
      if (status === 'SENT') report.sent++;
      else if (status === 'FAILED') report.failed++;
      else report.skipped++;
    }
    report.durationMs = Date.now() - t0;
    return report;
  }

  /** Cart-abandon: added to cart > 24h ago, no purchase since. */
  async sweepCartAbandon(): Promise<SweepReport> {
    const t0 = Date.now();
    const report: SweepReport = {
      kind: 'CART_ABANDON',
      scanned: 0,
      matched: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
    };

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT e.userId, e.entityId AS productId, MAX(e.ts) AS addedAt
       FROM user_events e
       WHERE e.userId IS NOT NULL
         AND e.kind = 'add_to_cart'
         AND e.ts >= datetime('now','-7 days')
         AND e.ts <= datetime('now','-1 days')
       GROUP BY e.userId, e.entityId`,
    )) as Array<{ userId: string; productId: string; addedAt: string }>;
    report.scanned = rows.length;
    if (rows.length === 0) {
      report.durationMs = Date.now() - t0;
      return report;
    }

    // Skip if the user has any purchase event since the cart add
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const placeholders = userIds.map(() => '?').join(',');
    const purchRows = (await this.prisma.$queryRawUnsafe(
      `SELECT userId, MAX(ts) AS lastPurchase
       FROM user_events
       WHERE userId IN (${placeholders})
         AND kind = 'purchase'
       GROUP BY userId`,
      ...userIds,
    )) as Array<{ userId: string; lastPurchase: string }>;
    const lastPurchase = new Map(
      purchRows.map((r) => [r.userId, r.lastPurchase] as const),
    );

    const candidates = rows.filter((r) => {
      const lp = lastPurchase.get(r.userId);
      if (!lp) return true;
      return new Date(lp).getTime() < new Date(r.addedAt).getTime();
    });
    report.matched = candidates.length;
    if (candidates.length === 0) {
      report.durationMs = Date.now() - t0;
      return report;
    }

    const pids = Array.from(new Set(candidates.map((c) => c.productId)));
    const productsRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, name FROM products WHERE id IN (${pids.map(() => '?').join(',')})`,
      ...pids,
    )) as Array<{ id: string; name: string }>;
    const nameById = new Map(productsRows.map((p) => [p.id, p.name]));

    for (const c of candidates) {
      const name = nameById.get(c.productId) ?? 'ของในตะกร้า';
      const status = await this.fireNudge({
        userId: c.userId,
        kind: 'CART_ABANDON',
        entityType: 'product',
        entityId: c.productId,
        title: 'ของรอคุณอยู่ในตะกร้านะ',
        body: `อย่าลืม "${truncate(name, 40)}" ที่คุณใส่ไว้`,
        deepLink: `/cart`,
        payload: {},
      });
      if (status === 'SENT') report.sent++;
      else if (status === 'FAILED') report.failed++;
      else report.skipped++;
    }
    report.durationMs = Date.now() - t0;
    return report;
  }

  /** Win-back: no session activity for 14+ days but has a taste profile. */
  async sweepWinBack(): Promise<SweepReport> {
    const t0 = Date.now();
    const report: SweepReport = {
      kind: 'WIN_BACK',
      scanned: 0,
      matched: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
    };

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.userId, MAX(s.lastSeenAt) AS lastSeenAt
       FROM user_profiles p
       LEFT JOIN user_sessions s ON s.userId = p.userId
       GROUP BY p.userId
       HAVING (lastSeenAt IS NULL
               OR lastSeenAt < datetime('now','-14 days'))`,
    )) as Array<{ userId: string; lastSeenAt: string | null }>;
    report.scanned = rows.length;
    if (rows.length === 0) {
      report.durationMs = Date.now() - t0;
      return report;
    }
    report.matched = rows.length;

    for (const r of rows) {
      const status = await this.fireNudge({
        userId: r.userId,
        kind: 'WIN_BACK',
        entityType: null,
        entityId: null,
        title: 'คิดถึงคุณ',
        body: 'เรามีของใหม่ที่คุณน่าจะถูกใจ มาดูสักหน่อยไหม?',
        deepLink: '/feed',
        payload: {},
      });
      if (status === 'SENT') report.sent++;
      else if (status === 'FAILED') report.failed++;
      else report.skipped++;
    }
    report.durationMs = Date.now() - t0;
    return report;
  }

  /** Fav-shop new arrival: top-affinity shop dropped a new item in last 24h. */
  async sweepFavShopNewArrival(): Promise<SweepReport> {
    const t0 = Date.now();
    const report: SweepReport = {
      kind: 'FAV_SHOP_NEW_ARRIVAL',
      scanned: 0,
      matched: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
    };

    // 1. Products created in the last 24h, grouped by shop
    const freshProducts = (await this.prisma.$queryRawUnsafe(
      `SELECT id, shopId, name FROM products
       WHERE status = 'ACTIVE'
         AND createdAt >= datetime('now','-1 days')`,
    )) as Array<{ id: string; shopId: string; name: string }>;
    if (freshProducts.length === 0) {
      report.durationMs = Date.now() - t0;
      return report;
    }
    const byShop = new Map<string, Array<{ id: string; name: string }>>();
    for (const p of freshProducts) {
      const arr = byShop.get(p.shopId) ?? [];
      arr.push({ id: p.id, name: p.name });
      byShop.set(p.shopId, arr);
    }

    // 2. Users whose top affinity shop is one of the shops that just dropped
    // (we cap "top" at the first 3 ranked shops in the profile)
    const profiles = (await this.prisma.$queryRawUnsafe(
      `SELECT userId, shopAffinityJson FROM user_profiles
       WHERE eventCount > 0`,
    )) as Array<{ userId: string; shopAffinityJson: string }>;
    report.scanned = profiles.length;

    for (const prof of profiles) {
      let aff: Record<string, number> = {};
      try {
        aff = JSON.parse(prof.shopAffinityJson) as Record<string, number>;
      } catch {
        continue;
      }
      const topShops = Object.entries(aff)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);
      const hit = topShops.find((s) => byShop.has(s));
      if (!hit) continue;
      const newItems = byShop.get(hit)!;
      if (!newItems || newItems.length === 0) continue;
      report.matched++;
      const sample = newItems[0]!;

      const status = await this.fireNudge({
        userId: prof.userId,
        kind: 'FAV_SHOP_NEW_ARRIVAL',
        entityType: 'shop',
        entityId: hit,
        title: 'ร้านโปรดมีของใหม่',
        body: `${truncate(sample.name, 40)} และอีก ${newItems.length - 1} ชิ้น`,
        deepLink: `/shop/${hit}`,
        payload: { shopId: hit, newCount: newItems.length },
      });
      if (status === 'SENT') report.sent++;
      else if (status === 'FAILED') report.failed++;
      else report.skipped++;
    }
    report.durationMs = Date.now() - t0;
    return report;
  }

  /**
   * Take a daily snapshot of every product's price. Used by the price-drop
   * detector. Idempotent — one row per (product, date).
   */
  async snapshotPrices(): Promise<{ snapped: number }> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO product_price_history (productId, date, priceCents, seenCount)
       SELECT id, date('now'), priceCents, 1 FROM products
       WHERE NOT EXISTS (
         SELECT 1 FROM product_price_history h
         WHERE h.productId = products.id AND h.date = date('now')
       )`,
    );
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM product_price_history WHERE date = date('now')`,
    )) as Array<{ c: number }>;
    return { snapped: Number(rows[0]?.c ?? 0) };
  }

  /** Price-drop: viewed product whose price today is < 90% of prior-week median. */
  async sweepPriceDrop(): Promise<SweepReport> {
    const t0 = Date.now();
    const report: SweepReport = {
      kind: 'PRICE_DROP',
      scanned: 0,
      matched: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
    };

    // Products with a meaningful price drop today
    const drops = (await this.prisma.$queryRawUnsafe(
      `SELECT today.productId,
              today.priceCents AS todayPrice,
              prev.refPrice
       FROM (
         SELECT productId, priceCents
         FROM product_price_history
         WHERE date = date('now')
       ) today
       JOIN (
         SELECT productId, MAX(priceCents) AS refPrice
         FROM product_price_history
         WHERE date >= date('now','-14 days')
           AND date < date('now')
         GROUP BY productId
       ) prev ON prev.productId = today.productId
       WHERE today.priceCents < prev.refPrice * 0.9`,
    )) as Array<{ productId: string; todayPrice: number; refPrice: number }>;
    if (drops.length === 0) {
      report.durationMs = Date.now() - t0;
      return report;
    }
    const droppedIds = drops.map((d) => d.productId);
    const placeholders = droppedIds.map(() => '?').join(',');

    // Users who viewed any of these products in the last 30 days
    const watchers = (await this.prisma.$queryRawUnsafe(
      `SELECT DISTINCT userId, entityId AS productId
       FROM user_events
       WHERE userId IS NOT NULL
         AND entityType = 'product'
         AND kind = 'product_view'
         AND entityId IN (${placeholders})
         AND ts >= datetime('now','-30 days')`,
      ...droppedIds,
    )) as Array<{ userId: string; productId: string }>;
    report.scanned = watchers.length;
    report.matched = watchers.length;

    const priceById = new Map(
      drops.map((d) => [d.productId, d] as const),
    );
    const productNames = (await this.prisma.$queryRawUnsafe(
      `SELECT id, name FROM products WHERE id IN (${placeholders})`,
      ...droppedIds,
    )) as Array<{ id: string; name: string }>;
    const nameById = new Map(productNames.map((p) => [p.id, p.name]));

    for (const w of watchers) {
      const info = priceById.get(w.productId);
      if (!info) continue;
      const name = nameById.get(w.productId) ?? 'สินค้า';
      const dropPct = Math.round(
        (1 - info.todayPrice / info.refPrice) * 100,
      );
      const status = await this.fireNudge({
        userId: w.userId,
        kind: 'PRICE_DROP',
        entityType: 'product',
        entityId: w.productId,
        title: `ราคาลด ${dropPct}%`,
        body: `${truncate(name, 40)} ลดเหลือ ${formatTHB(info.todayPrice)}`,
        deepLink: `/product/${w.productId}`,
        payload: {
          dropPct,
          todayPriceCents: info.todayPrice,
          refPriceCents: info.refPrice,
        },
      });
      if (status === 'SENT') report.sent++;
      else if (status === 'FAILED') report.failed++;
      else report.skipped++;
    }
    report.durationMs = Date.now() - t0;
    return report;
  }

  // ────────────────────────────────────────────────────────────────────
  // Chatbot helper — surface "what is the user looking at" to the bot
  // ────────────────────────────────────────────────────────────────────

  /** Recent browse history for a user (used by chat tool `recent_browse`). */
  async recentBrowseSummary(
    userId: string,
    limit = 5,
  ): Promise<
    Array<{
      productId: string;
      name: string;
      shopName: string | null;
      lastSeen: string;
    }>
  > {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id AS productId, p.name, s.name AS shopName, MAX(e.ts) AS lastSeen
       FROM user_events e
       JOIN products p ON p.id = e.entityId
       LEFT JOIN shops s ON s.id = p.shopId
       WHERE e.userId = ?
         AND e.entityType = 'product'
         AND e.kind = 'product_view'
       GROUP BY p.id
       ORDER BY lastSeen DESC
       LIMIT ?`,
      userId,
      Math.max(1, Math.min(limit, 10)),
    )) as Array<{
      productId: string;
      name: string;
      shopName: string | null;
      lastSeen: string;
    }>;
    return rows;
  }

  /** Convenience exposed for tests: token a product's name for taste. */
  tokenizeProductName(name: string): string[] {
    return tokenize(name);
  }
}

// ── helpers ──────────────────────────────────────────────────────────

/** Coerce arbitrary payload into a flat Record<string,string> so push provider
 *  data fields (FCM data, web-push payload) accept it without serialisation
 *  surprises. */
function stringifyPayload(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v == null) continue;
    out[k] =
      typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean'
          ? String(v)
          : JSON.stringify(v);
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function formatTHB(cents: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
