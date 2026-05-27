import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BuyAgainItem,
  ProductRecommendation,
  RecommendationBreakdown,
  RecommendationReason,
} from '../../shared/types';
import { buildTfidf, tokenize, topSimilar } from '../../common/text/tfidf';
import { measured, logModelRun } from '../../common/ai/model-runs';
import { TasteService } from '../taste/taste.service';
import { rerankWithLLM } from './llm-rerank';

interface DbProductRow {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  priceCents: number;
  status: string;
  createdAt: string;
}

interface DbBuyAgainRow {
  productId: string;
  name: string;
  priceCents: number;
  shopId: string;
  shopName: string | null;
  lastOrderedAt: string;
  timesBought: number;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional so legacy tests / bootstrap order isn't broken; if absent
    // forYou2 falls back to the legacy forYou path.
    @Optional() private readonly taste?: TasteService,
  ) {}

  /**
   * "แนะนำสำหรับคุณ" — สำหรับลูกค้า
   *
   * Strategy:
   *   1. หา productId ที่ลูกค้าเคยซื้อ → ดู shopId/category-คล้ายๆ → boost
   *   2. รวมกับ popular product (จำนวน orders ใน 30 วัน)
   *   3. ถ้าลูกค้าใหม่ (ไม่มีออเดอร์) → fallback เป็น popularity เพียวๆ
   *   4. กรอง product ที่ตัวเองเคยซื้อออก (เน้นแนะนำของใหม่)
   */
  async forYou(
    userId: string | null,
    limit = 12,
  ): Promise<ProductRecommendation[]> {
    return measured(this.prisma, 'reco.for-you', () =>
      this._forYou(userId, limit),
    );
  }

  private async _forYou(
    userId: string | null,
    limit = 12,
  ): Promise<ProductRecommendation[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));

    // Phase 19.5 — popularity score (orders in last 30 days).
    // Pre-compute cutoff as a JS Date so $queryRaw binds it via Prisma (DB-agnostic).
    const cutoff30 = new Date(Date.now() - 30 * 86400_000);
    type PopRow = {
      id: string;
      shopId: string;
      name: string;
      priceCents: number;
      shopName: string | null;
      units: number | bigint;
    };
    const popularRaw = (await this.prisma.$queryRaw<PopRow[]>`
      SELECT p.id, p."shopId", p.name, p."priceCents", s.name AS "shopName",
             COALESCE(SUM(oi.quantity), 0) AS units
      FROM products p
      LEFT JOIN order_items oi ON oi."productId" = p.id
      LEFT JOIN orders o ON o.id = oi."orderId"
        AND o.status NOT IN ('CANCELLED')
        AND o."createdAt" >= ${cutoff30}
      LEFT JOIN shops s ON s.id = p."shopId"
      WHERE p.status = 'ACTIVE'
      GROUP BY p.id, s.name
      ORDER BY units DESC, p."createdAt" DESC
      LIMIT ${safeLimit * 4}
    `);
    const popular = popularRaw.map((r) => ({ ...r, units: Number(r.units) }));

    let ownedShopIds = new Set<string>();
    let ownedProductIds = new Set<string>();
    if (userId) {
      // Cheap join via Prisma client — gets distinct (productId, shopId)
      // for everything this user has bought. We cap at 100 distinct items.
      const history = await this.prisma.orderItem.findMany({
        where: { order: { customerId: userId } },
        select: { product: { select: { id: true, shopId: true } } },
        take: 100,
      });
      for (const h of history) {
        if (!h.product) continue;
        ownedProductIds.add(h.product.id);
        ownedShopIds.add(h.product.shopId);
      }
    }

    const maxUnits = Math.max(...popular.map((p) => p.units), 1);

    const scored: ProductRecommendation[] = popular
      .filter((p) => !ownedProductIds.has(p.id))
      .map((p) => {
        const popScore = p.units / maxUnits; // 0..1
        const affinityBoost = ownedShopIds.has(p.shopId) ? 0.25 : 0;
        const score = Math.min(1, popScore * 0.75 + affinityBoost);
        const reason: RecommendationReason = ownedShopIds.has(p.shopId)
          ? 'BECAUSE_BOUGHT'
          : 'POPULAR';
        const reasonText = ownedShopIds.has(p.shopId)
          ? 'จากร้านที่คุณเคยซื้อ'
          : 'ขายดีช่วงนี้';
        return {
          productId: p.id,
          name: p.name,
          priceCents: p.priceCents,
          thumbUrl: null,
          shopId: p.shopId,
          shopName: p.shopName,
          score,
          reason,
          reasonText,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);

    return scored;
  }

  /**
   * "สินค้าที่คล้ายกัน" — content-based via TF-IDF cosine on (name + description)
   * blended with popularity (60% text, 25% popularity, 15% same-shop boost).
   *
   * Fallback to same-shop + price-band when text similarity is too weak.
   */
  async similar(productId: string, limit = 8): Promise<ProductRecommendation[]> {
    return measured(this.prisma, 'reco.similar', () =>
      this._similar(productId, limit),
    );
  }

  private async _similar(
    productId: string,
    limit = 8,
  ): Promise<ProductRecommendation[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const seedRow = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        shopId: true,
        name: true,
        description: true,
        priceCents: true,
        status: true,
        createdAt: true,
      },
    });
    if (!seedRow) return [];
    const seed: DbProductRow = {
      ...seedRow,
      createdAt:
        seedRow.createdAt instanceof Date
          ? seedRow.createdAt.toISOString()
          : seedRow.createdAt,
    };

    // Pull a wide candidate set: all active products of the platform.
    // For larger corpora switch to pgvector / pre-built ANN index.
    // Phase 19.5 — pre-computed cutoff binds via $queryRaw template literal.
    const cutoff30 = new Date(Date.now() - 30 * 86400_000);
    type SimilarRow = {
      id: string;
      shopId: string;
      name: string;
      description: string | null;
      priceCents: number;
      shopName: string | null;
      units: number | bigint;
    };
    const rawRows = (await this.prisma.$queryRaw<SimilarRow[]>`
      SELECT p.id, p."shopId", p.name, p.description, p."priceCents",
             s.name AS "shopName",
             COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS units
      FROM products p
      LEFT JOIN order_items oi ON oi."productId" = p.id
      LEFT JOIN orders o ON o.id = oi."orderId"
        AND o.status NOT IN ('CANCELLED')
        AND o."createdAt" >= ${cutoff30}
      LEFT JOIN shops s ON s.id = p."shopId"
      WHERE p.status = 'ACTIVE'
      GROUP BY p.id, s.name
    `);
    const rows = rawRows.map((r) => ({ ...r, units: Number(r.units) }));

    if (rows.length <= 1) return [];

    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const corpus = rows.map((r) => ({
      id: r.id,
      text: `${r.name} ${r.description ?? ''}`,
    }));
    const index = buildTfidf(corpus);
    const simResults = topSimilar(index, productId, safeLimit * 3);

    const maxUnits = Math.max(...rows.map((r) => r.units), 1);

    // Combined ranking
    const candidates: ProductRecommendation[] = [];
    for (const sr of simResults) {
      const cand = byId.get(sr.id);
      if (!cand) continue;
      const popScore = cand.units / maxUnits;
      const sameShopBoost = cand.shopId === seed.shopId ? 0.15 : 0;
      const blended = sr.score * 0.6 + popScore * 0.25 + sameShopBoost;
      const reason: RecommendationReason =
        sr.score > 0.15
          ? 'SAME_CATEGORY'
          : cand.shopId === seed.shopId
            ? 'BECAUSE_BOUGHT'
            : 'POPULAR';
      const reasonText =
        sr.score > 0.15
          ? `เนื้อหาคล้ายกัน ${Math.round(sr.score * 100)}%`
          : cand.shopId === seed.shopId
            ? 'ร้านเดียวกัน'
            : 'ขายดี';
      candidates.push({
        productId: cand.id,
        name: cand.name,
        priceCents: cand.priceCents,
        thumbUrl: null,
        shopId: cand.shopId,
        shopName: cand.shopName,
        score: Math.min(1, blended),
        reason,
        reasonText,
      });
    }
    let scored: ProductRecommendation[] = candidates;

    // Fallback: low text-sim signal → expand to same-shop / price-band candidates
    if (scored.length < safeLimit) {
      const lo = Math.floor(seed.priceCents * 0.7);
      const hi = Math.ceil(seed.priceCents * 1.3);
      const seen = new Set(scored.map((s) => s.productId));
      const fallback = rows
        .filter(
          (r) =>
            r.id !== productId &&
            !seen.has(r.id) &&
            (r.shopId === seed.shopId ||
              (r.priceCents >= lo && r.priceCents <= hi)),
        )
        .sort((a, b) => b.units - a.units)
        .slice(0, safeLimit - scored.length)
        .map<ProductRecommendation>((r) => ({
          productId: r.id,
          name: r.name,
          priceCents: r.priceCents,
          thumbUrl: null,
          shopId: r.shopId,
          shopName: r.shopName,
          score: 0.2 + (r.units / maxUnits) * 0.3,
          reason: r.shopId === seed.shopId ? 'BECAUSE_BOUGHT' : 'POPULAR',
          reasonText: r.shopId === seed.shopId ? 'ร้านเดียวกัน' : 'ราคาใกล้เคียง',
        }));
      scored = [...scored, ...fallback];
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);
  }

  // ===========================================================================
  // Trending — products with surge in 7d orders vs 30d baseline
  // ===========================================================================
  async trending(limit = 12): Promise<ProductRecommendation[]> {
    return measured(this.prisma, 'reco.trending', () =>
      this._trending(limit),
    );
  }

  private async _trending(limit = 12): Promise<ProductRecommendation[]> {
    const safe = Math.max(1, Math.min(limit, 30));
    // Phase 19.5 — pre-computed cutoff dates instead of inline SQLite `date('now','-N days')`
    // (Postgres lacks that signature). Sent via $queryRaw tagged template so Prisma binds the
    // params with the correct driver-native placeholder ($1, $2, ...) on every supported DB.
    const now = new Date();
    const cutoff7 = new Date(now.getTime() - 7 * 86400_000);
    const cutoff30 = new Date(now.getTime() - 30 * 86400_000);
    type TrendingRow = {
      id: string;
      shopId: string;
      name: string;
      priceCents: number;
      shopName: string | null;
      u7: number | bigint;
      u30: number | bigint;
    };
    const rows = (await this.prisma.$queryRaw<TrendingRow[]>`
      SELECT p.id, p."shopId", p.name, p."priceCents", s.name AS "shopName",
             COALESCE(SUM(CASE
               WHEN o.id IS NOT NULL
                 AND o."createdAt" >= ${cutoff7}
               THEN oi.quantity ELSE 0 END), 0) AS u7,
             COALESCE(SUM(CASE
               WHEN o.id IS NOT NULL
                 AND o."createdAt" >= ${cutoff30}
               THEN oi.quantity ELSE 0 END), 0) AS u30
      FROM products p
      LEFT JOIN order_items oi ON oi."productId" = p.id
      LEFT JOIN orders o ON o.id = oi."orderId"
        AND o.status NOT IN ('CANCELLED')
      LEFT JOIN shops s ON s.id = p."shopId"
      WHERE p.status = 'ACTIVE'
      GROUP BY p.id, s.name
      HAVING COALESCE(SUM(CASE
               WHEN o.id IS NOT NULL
                 AND o."createdAt" >= ${cutoff7}
               THEN oi.quantity ELSE 0 END), 0) >= 3
      ORDER BY u7 DESC
    `);

    // surge ratio: 7d-orders / (avg-weekly over 30d = u30 / 4.3)
    // Postgres SUM() returns BIGINT via Prisma — coerce to number for math.
    const enriched = rows.map((r) => {
      const u7 = Number(r.u7);
      const u30 = Number(r.u30);
      const baselineWeekly = u30 / 4.3;
      const surge = baselineWeekly > 0 ? u7 / baselineWeekly : u7;
      return { ...r, u7, u30, surge };
    });
    enriched.sort((a, b) => b.surge - a.surge);

    const maxSurge = Math.max(...enriched.map((r) => r.surge), 1);
    return enriched.slice(0, safe).map((r) => {
      const score = Math.min(1, r.surge / maxSurge);
      return {
        productId: r.id,
        name: r.name,
        priceCents: r.priceCents,
        thumbUrl: null,
        shopId: r.shopId,
        shopName: r.shopName,
        score,
        reason: 'TRENDING' as RecommendationReason,
        reasonText: `${r.u7} ชิ้นใน 7 วัน (พุ่ง ${(r.surge).toFixed(1)}×)`,
      };
    });
  }

  /**
   * "ซื้อซ้ำ" — สินค้าที่ลูกค้าเคยสั่ง สามารถสั่งใหม่ได้
   */
  async buyAgain(userId: string, limit = 12): Promise<BuyAgainItem[]> {
    return measured(this.prisma, 'reco.buy-again', () =>
      this._buyAgain(userId, limit),
    );
  }

  private async _buyAgain(
    userId: string,
    limit = 12,
  ): Promise<BuyAgainItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    // Phase 19.5 — $queryRaw with bound params + camelCase columns quoted
    // (Postgres folds unquoted identifiers to lowercase, which breaks
    // `o.createdAt`, `oi.orderId`, etc.).
    type BuyAgainRaw = {
      productId: string;
      name: string;
      priceCents: number;
      shopId: string;
      shopName: string | null;
      lastOrderedAt: Date | string;
      timesBought: number | bigint;
    };
    const rows = (await this.prisma.$queryRaw<BuyAgainRaw[]>`
      SELECT p.id AS "productId",
             p.name,
             p."priceCents",
             p."shopId",
             s.name AS "shopName",
             MAX(o."createdAt") AS "lastOrderedAt",
             COUNT(DISTINCT o.id) AS "timesBought"
      FROM orders o
      JOIN order_items oi ON oi."orderId" = o.id
      JOIN products p ON p.id = oi."productId"
      LEFT JOIN shops s ON s.id = p."shopId"
      WHERE o."customerId" = ${userId}
        AND p.status = 'ACTIVE'
      GROUP BY p.id, s.name
      ORDER BY "lastOrderedAt" DESC, "timesBought" DESC
      LIMIT ${safeLimit}
    `);

    return rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      priceCents: r.priceCents,
      thumbUrl: null,
      shopId: r.shopId,
      shopName: r.shopName,
      lastOrderedAt:
        r.lastOrderedAt instanceof Date
          ? r.lastOrderedAt.toISOString()
          : r.lastOrderedAt,
      timesBought: Number(r.timesBought),
    }));
  }

  // ===========================================================================
  // Phase 10.2 — forYou2: multi-signal ranker that uses the user's taste
  // profile from the firehose. Blends 5 signals and applies a soft MMR
  // diversity rerank so feeds don't get dominated by one shop.
  //
  // Falls back to legacy `forYou()` when:
  //   - taste service isn't wired in this build, or
  //   - user has no profile yet (cold start), or
  //   - profile is empty (eventCount = 0).
  // ===========================================================================

  async forYou2(
    userId: string | null,
    limit = 12,
  ): Promise<ProductRecommendation[]> {
    return measured(this.prisma, 'reco.for-you-v2', () =>
      this._forYou2(userId, limit),
    );
  }

  private async _forYou2(
    userId: string | null,
    limit: number,
  ): Promise<ProductRecommendation[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    if (!this.taste || !userId) {
      return this._forYou(userId, safeLimit);
    }
    const profile = await this.taste.get(userId);
    if (!profile || profile.eventCount <= 0) {
      return this._forYou(userId, safeLimit);
    }

    // Score a slightly bigger pool than `limit` so the LLM rerank (or our
    // diversity rerank) has room to swap items.
    const scored = await this.scoreForUser(profile, Math.min(safeLimit * 3, 30));
    if (scored.length === 0) {
      return this._forYou(userId, safeLimit);
    }
    const recs = scored.map(toRecommendation);

    if (process.env.LLM_RERANK_ENABLED === 'true') {
      const summary = await this.taste.summary(userId);
      const rr = await rerankWithLLM({
        user: summary,
        candidates: recs,
        topK: safeLimit,
      });
      if (!rr.fellBack) {
        void logModelRun(
          this.prisma,
          'reco.for-you-v2.rerank',
          rr.durationMs,
        );
        return rr.ranked.slice(0, safeLimit);
      }
    }
    return recs.slice(0, safeLimit);
  }

  /** Same as `forYou2` but also returns per-candidate breakdowns. */
  async forYou2Explain(
    userId: string,
    limit = 12,
  ): Promise<{
    recommendations: ProductRecommendation[];
    breakdowns: RecommendationBreakdown[];
  }> {
    return measured(this.prisma, 'reco.for-you-v2-explain', async () => {
      const safeLimit = Math.max(1, Math.min(limit, 50));
      if (!this.taste) {
        const recs = await this._forYou(userId, safeLimit);
        return { recommendations: recs, breakdowns: [] };
      }
      const profile = await this.taste.get(userId);
      if (!profile || profile.eventCount <= 0) {
        const recs = await this._forYou(userId, safeLimit);
        return { recommendations: recs, breakdowns: [] };
      }
      const scored = await this.scoreForUser(profile, safeLimit);
      return {
        recommendations: scored.map(toRecommendation),
        breakdowns: scored.map(({ rec, breakdown }) => ({
          ...breakdown,
          productId: rec.productId,
        })),
      };
    });
  }

  // ── Internal: heavy lifting for both forYou2 entry points ──────────────────
  private async scoreForUser(
    profile: import('../../shared/types').UserTasteProfile,
    limit: number,
  ): Promise<Array<{ rec: ProductRecommendation; breakdown: RecommendationBreakdown }>> {
    // Phase 19.5 — ported from raw $queryRawUnsafe.
    // ── 1. Candidate pool: ACTIVE products + 30d units for popularity score
    const cutoff30 = new Date(Date.now() - 30 * 86400_000);
    type CandRaw = {
      id: string;
      shopId: string;
      name: string;
      description: string | null;
      priceCents: number;
      shopName: string | null;
      units: number | bigint;
    };
    const candRowsRaw = (await this.prisma.$queryRaw<CandRaw[]>`
      SELECT p.id, p."shopId", p.name, p.description, p."priceCents",
             s.name AS "shopName",
             COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS units
      FROM products p
      LEFT JOIN order_items oi ON oi."productId" = p.id
      LEFT JOIN orders o ON o.id = oi."orderId"
        AND o.status NOT IN ('CANCELLED')
        AND o."createdAt" >= ${cutoff30}
      LEFT JOIN shops s ON s.id = p."shopId"
      WHERE p.status = 'ACTIVE'
      GROUP BY p.id, s.name
    `);
    const candRows = candRowsRaw.map((r) => ({ ...r, units: Number(r.units) }));
    if (candRows.length === 0) return [];

    // Exclude items the user already bought (don't recommend the same toaster
    // they just got — prefer accessories via co-purchase someday).
    const owned = new Set(profile.boughtItemIds);
    const candidates = candRows.filter((r) => !owned.has(r.id));

    // ── 2. Build TF-IDF over candidates + recent items (extend corpus so the
    //      user's history is in the same vector space).
    const recentRows = profile.recentItemIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: profile.recentItemIds } },
          select: { id: true, name: true, description: true },
        })
      : [];

    const corpus = [
      ...candidates.map((r) => ({
        id: `c:${r.id}`,
        text: `${r.name} ${r.description ?? ''}`,
      })),
      ...recentRows.map((r) => ({
        id: `h:${r.id}`,
        text: `${r.name} ${r.description ?? ''}`,
      })),
    ];
    const index = buildTfidf(corpus);

    // ── 3. User vector — recency-weighted average of recent item TF-IDFs.
    //      recentItemIds is in newest→oldest order from TasteService.
    const userVec = new Map<string, number>();
    for (let i = 0; i < profile.recentItemIds.length; i++) {
      const recentVec = index.vectors.get(`h:${profile.recentItemIds[i]}`);
      if (!recentVec) continue;
      const recencyWeight = Math.exp(-i / 10); // newest = 1.0, 10th ≈ 0.37
      for (const [t, v] of recentVec) {
        userVec.set(t, (userVec.get(t) ?? 0) + v * recencyWeight);
      }
    }
    const userMag = vectorMagnitude(userVec);

    // ── 4. Pre-compute popularity normaliser
    const maxUnits = Math.max(1, ...candidates.map((c) => c.units));

    // Get max shop affinity for normalisation
    const maxShopAff = Math.max(0.0001, ...Object.values(profile.shopAffinity));

    // ── 5. Score each candidate
    interface Scored {
      rec: ProductRecommendation;
      breakdown: RecommendationBreakdown;
      shopId: string;
    }
    const scored: Scored[] = candidates.map((c) => {
      const candVec = index.vectors.get(`c:${c.id}`);
      const contentSim =
        candVec && userMag > 0
          ? cosineFromMaps(userVec, userMag, candVec) // 0..1
          : 0;

      const shopAff =
        (profile.shopAffinity[c.shopId] ?? 0) / maxShopAff; // 0..1

      // tagAffinity: sum of user weights on tokens that appear in candidate
      const candTokens = new Set(tokenize(`${c.name} ${c.description ?? ''}`));
      let tagSum = 0;
      let tagHits = 0;
      for (const t of candTokens) {
        const w = profile.tagAffinity[t];
        if (w && w > 0) {
          tagSum += w;
          tagHits++;
        }
      }
      const tagAffinity =
        tagHits === 0 ? 0 : Math.min(1, tagSum / Math.sqrt(candTokens.size));

      const priceMatch = profile.priceMedianCents > 0 ? priceFit(
        c.priceCents,
        profile.priceMedianCents,
        Math.max(profile.priceStdCents, profile.priceMedianCents * 0.3),
      ) : 0;

      const popularity = c.units / maxUnits;

      const exploration = Math.random() * 0.15; // small jitter for novelty

      // Weighted blend — keep weights summing to ~1.0 so the final score
      // stays in 0..1 range that downstream UIs can render as a bar.
      const total = clamp01(
        0.30 * contentSim +
          0.25 * shopAff +
          0.20 * tagAffinity +
          0.10 * priceMatch +
          0.10 * popularity +
          0.05 * exploration,
      );

      // Pick the dominant signal as the explainability "reason"
      const components: Array<[number, RecommendationReason, string]> = [
        [0.30 * contentSim, 'BECAUSE_VIEWED', 'คล้ายของที่คุณเพิ่งดู'],
        [0.25 * shopAff, 'FAVOURITE_SHOP', 'จากร้านที่คุณกลับมาดูบ่อย'],
        [0.20 * tagAffinity, 'SAME_CATEGORY', 'หมวดที่คุณสนใจ'],
        [0.10 * priceMatch, 'PRICE_MATCH', 'ราคาในงบที่คุณชอบ'],
        [0.10 * popularity, 'POPULAR', 'ขายดีช่วงนี้'],
        [0.05 * exploration, 'EXPLORE', 'ลองของใหม่ที่อาจชอบ'],
      ];
      components.sort((a, b) => b[0] - a[0]);
      const [, reason, reasonText] = components[0] ?? [
        0,
        'POPULAR' as RecommendationReason,
        'ขายดีช่วงนี้',
      ];

      return {
        shopId: c.shopId,
        rec: {
          productId: c.id,
          name: c.name,
          priceCents: c.priceCents,
          thumbUrl: null,
          shopId: c.shopId,
          shopName: c.shopName,
          score: total,
          reason,
          reasonText,
        },
        breakdown: {
          productId: c.id,
          total,
          contentSim,
          shopAffinity: shopAff,
          tagAffinity,
          priceMatch,
          popularity,
          exploration,
          reason,
        },
      };
    });

    // ── 6. MMR-style diversity rerank: cap shop occurrences in the top N.
    //      We don't apply a heavy penalty — just enforce "no more than 3 in
    //      a row from the same shop in the top `limit`".
    scored.sort((a, b) => b.rec.score - a.rec.score);
    const finalList: Scored[] = [];
    const shopCount = new Map<string, number>();
    const overflow: Scored[] = [];
    for (const s of scored) {
      const cnt = shopCount.get(s.shopId) ?? 0;
      if (cnt >= 3) {
        overflow.push(s);
        continue;
      }
      shopCount.set(s.shopId, cnt + 1);
      finalList.push(s);
      if (finalList.length >= limit) break;
    }
    // If we couldn't fill the requested limit due to the diversity cap,
    // backfill from overflow.
    for (const s of overflow) {
      if (finalList.length >= limit) break;
      finalList.push(s);
    }
    return finalList;
  }

  /**
   * บันทึก view (เก็บไว้ใช้ score popularity แม่นขึ้น)
   */
  async trackView(
    userId: string | null,
    productId: string,
    source?: string,
  ): Promise<void> {
    const t0 = Date.now();
    await this.prisma.productView.create({
      data: {
        id: newId('view'),
        productId,
        userId,
        source: source ?? null,
      },
    });
    void logModelRun(this.prisma, 'reco.track-view', Date.now() - t0);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers (no service state) — top-level so they're tree-shakeable and
// trivially unit-testable.
// ──────────────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Fit price to user's median+std envelope. Gaussian-like, returns 0..1. */
function priceFit(price: number, median: number, std: number): number {
  if (median <= 0 || std <= 0) return 0;
  const z = (price - median) / std;
  // exp(-z^2/2) is the unnormalised gaussian — peaks at z=0
  return Math.exp(-(z * z) / 2);
}

function vectorMagnitude(v: Map<string, number>): number {
  let s = 0;
  for (const w of v.values()) s += w * w;
  return Math.sqrt(s);
}

/** Cosine between a Map-vector (with precomputed magnitude) and a TF-IDF map. */
function cosineFromMaps(
  vA: Map<string, number>,
  magA: number,
  vB: Map<string, number>,
): number {
  if (magA <= 0) return 0;
  // magnitude of B is available via index.magnitudes but cheap to recompute
  let dot = 0;
  let magBSq = 0;
  for (const [t, b] of vB) {
    magBSq += b * b;
    const a = vA.get(t);
    if (a) dot += a * b;
  }
  const magB = Math.sqrt(magBSq);
  if (magB <= 0) return 0;
  return clamp01(dot / (magA * magB));
}

function toRecommendation(s: {
  rec: ProductRecommendation;
  breakdown: RecommendationBreakdown;
}): ProductRecommendation {
  return s.rec;
}
