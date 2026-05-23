import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ProductSearchHit,
  ProductSearchInput,
  ProductSearchResult,
  ShopSearchHit,
  Suggestion,
  TrackSearchInput,
  TrendingQuery,
} from '../../shared/types';
import { buildTfidf, cosineSim, tokenize } from '../../common/text/tfidf';
import { logModelRun, measured } from '../../common/ai/model-runs';

interface DbProductRow {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  status: string;
  shopName: string | null;
  units30d: number;
  avgRating: number | null;
  reviewCount: number;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // Product search — TF-IDF relevance + rating + popularity blended score
  // ===========================================================================
  async searchProducts(
    input: ProductSearchInput,
    userId: string | null,
  ): Promise<ProductSearchResult> {
    return measured(this.prisma, 'search.products', () =>
      this._searchProducts(input, userId),
    );
  }

  private async _searchProducts(
    input: ProductSearchInput,
    userId: string | null,
  ): Promise<ProductSearchResult> {
    const t0 = Date.now();
    const limit = Math.max(1, Math.min(input.limit ?? 24, 60));
    const q = (input.query ?? '').trim();
    const tokens = tokenize(q);

    // Build catalog candidate set (active products) — small enough to do in-memory.
    // For larger scale move to MeiliSearch / pg_trgm / pgvector.
    const filters: string[] = [`p.status = 'ACTIVE'`];
    const args: unknown[] = [];
    if (input.shopId) {
      filters.push(`p.shopId = ?`);
      args.push(input.shopId);
    }
    if (typeof input.minPriceCents === 'number') {
      filters.push(`p.priceCents >= ?`);
      args.push(input.minPriceCents);
    }
    if (typeof input.maxPriceCents === 'number') {
      filters.push(`p.priceCents <= ?`);
      args.push(input.maxPriceCents);
    }

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.shopId, p.name, p.description, p.priceCents, p.stock, p.status,
              s.name AS shopName,
              COALESCE(SUM(CASE
                WHEN o.id IS NOT NULL
                  AND o.createdAt >= date('now','-30 days')
                THEN oi.quantity ELSE 0 END), 0) AS units30d,
              (SELECT AVG(rating) FROM reviews r
                 WHERE r.productId = p.id AND r.isHidden = 0) AS avgRating,
              (SELECT COUNT(*) FROM reviews r
                 WHERE r.productId = p.id AND r.isHidden = 0) AS reviewCount
       FROM products p
       LEFT JOIN shops s ON s.id = p.shopId
       LEFT JOIN order_items oi ON oi.productId = p.id
       LEFT JOIN orders o ON o.id = oi.orderId
         AND o.status NOT IN ('CANCELLED')
       WHERE ${filters.join(' AND ')}
       GROUP BY p.id
       LIMIT 5000`,
      ...args,
    )) as DbProductRow[];

    // Apply rating filter in-memory (depends on aggregation)
    let pool = rows.filter(
      (r) => (r.avgRating ?? 0) >= (input.minRating ?? 0),
    );

    // Rank
    let scored: ProductSearchHit[];
    let explanation: string;

    if (tokens.length > 0 && pool.length > 0) {
      // TF-IDF relevance over pool
      const corpus = pool.map((r) => ({
        id: r.id,
        text: `${r.name} ${r.description ?? ''}`,
      }));
      const index = buildTfidf(corpus);
      // Treat query as a pseudo-doc and compute cosine vs each candidate.
      const queryCorpusId = '__q__';
      const queryIndex = buildTfidf([
        { id: queryCorpusId, text: q },
        ...corpus,
      ]);

      const maxUnits = Math.max(...pool.map((r) => r.units30d), 1);
      scored = pool
        .map((r) => {
          const sim = cosineSim(queryIndex, queryCorpusId, r.id);
          // Substring fallback (covers e.g. "iphone15" matching "iPhone 15")
          const containsBonus =
            sim < 0.05 &&
            r.name.toLowerCase().includes(q.toLowerCase()) &&
            q.length >= 2
              ? 0.4
              : 0;
          const relevance = sim + containsBonus;
          if (relevance < 0.02) return null;
          const popularity = r.units30d / maxUnits;
          const ratingBoost = ((r.avgRating ?? 0) / 5) * 0.1;
          const composite = Math.min(
            1,
            relevance * 0.7 + popularity * 0.2 + ratingBoost,
          );
          const matched = tokens.filter((t) =>
            (r.name + ' ' + (r.description ?? '')).toLowerCase().includes(t),
          );
          return {
            productId: r.id,
            name: r.name,
            priceCents: r.priceCents,
            thumbUrl: null,
            shopId: r.shopId,
            shopName: r.shopName,
            stock: r.stock,
            avgRating: r.avgRating ? Math.round(r.avgRating * 10) / 10 : 0,
            reviewCount: r.reviewCount,
            unitsSold30d: r.units30d,
            score: composite,
            matchedTerms: matched,
          } as ProductSearchHit;
        })
        .filter((x): x is ProductSearchHit => x !== null);

      // Touch index to avoid "unused" lint
      void index;

      explanation =
        'จัดอันดับด้วย TF-IDF (70%) + ความนิยม 30 วัน (20%) + รีวิว (10%)';
    } else {
      // No query → browse mode
      const maxUnits = Math.max(...pool.map((r) => r.units30d), 1);
      scored = pool.map((r) => ({
        productId: r.id,
        name: r.name,
        priceCents: r.priceCents,
        thumbUrl: null,
        shopId: r.shopId,
        shopName: r.shopName,
        stock: r.stock,
        avgRating: r.avgRating ? Math.round(r.avgRating * 10) / 10 : 0,
        reviewCount: r.reviewCount,
        unitsSold30d: r.units30d,
        score: Math.min(
          1,
          (r.units30d / maxUnits) * 0.6 + ((r.avgRating ?? 0) / 5) * 0.4,
        ),
        matchedTerms: [],
      }));
      explanation = q
        ? 'ไม่มีคำค้นที่เข้าเกณฑ์ token → เรียงตามความนิยม + คะแนนเฉลี่ย'
        : 'เรียงตามความนิยม 30 วัน + คะแนนเฉลี่ย';
    }

    // Apply sort
    switch (input.sort) {
      case 'PRICE_ASC':
        scored.sort((a, b) => a.priceCents - b.priceCents);
        explanation = 'เรียงราคาต่ำไปสูง';
        break;
      case 'PRICE_DESC':
        scored.sort((a, b) => b.priceCents - a.priceCents);
        explanation = 'เรียงราคาสูงไปต่ำ';
        break;
      case 'RATING':
        scored.sort(
          (a, b) =>
            b.avgRating - a.avgRating ||
            b.reviewCount - a.reviewCount ||
            b.score - a.score,
        );
        explanation = 'เรียงตามคะแนนรีวิวเฉลี่ย';
        break;
      case 'NEWEST':
        // Approximate: pool is unsorted; keep TF-IDF order if no createdAt fetched
        scored.sort((a, b) => b.score - a.score);
        explanation = 'เรียงล่าสุด (proxy: relevance)';
        break;
      case 'POPULAR':
        scored.sort((a, b) => b.unitsSold30d - a.unitsSold30d || b.score - a.score);
        explanation = 'เรียงขายดี 30 วัน';
        break;
      case 'RELEVANCE':
      default:
        scored.sort((a, b) => b.score - a.score);
        break;
    }

    const total = scored.length;
    const hits = scored.slice(0, limit);
    void pool; // unused beyond filter
    const tookMs = Math.max(0, Date.now() - t0);

    // Fire-and-forget log
    if (q.length > 0) {
      void this.recordQuery(q, userId, total);
    }

    return {
      hits,
      total,
      tookMs,
      explanation,
    };
  }

  // ===========================================================================
  // Shop search
  // ===========================================================================
  async searchShops(query: string, limit = 12): Promise<ShopSearchHit[]> {
    return measured(this.prisma, 'search.shops', () =>
      this._searchShops(query, limit),
    );
  }

  private async _searchShops(
    query: string,
    limit: number,
  ): Promise<ShopSearchHit[]> {
    const q = (query ?? '').trim();
    const safe = Math.max(1, Math.min(limit, 30));

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT s.id, s.name,
              (SELECT COUNT(*) FROM products p WHERE p.shopId = s.id AND p.status = 'ACTIVE') AS productCount,
              (SELECT AVG(r.rating) FROM reviews r WHERE r.shopId = s.id AND r.isHidden = 0) AS avgRating,
              (SELECT COUNT(*) FROM reviews r WHERE r.shopId = s.id AND r.isHidden = 0) AS reviewCount,
              COALESCE((
                SELECT SUM(oi.quantity)
                FROM order_items oi
                JOIN orders o ON o.id = oi.orderId
                JOIN products p ON p.id = oi.productId
                WHERE p.shopId = s.id
                  AND o.status NOT IN ('CANCELLED')
                  AND o.createdAt >= date('now', '-30 days')
              ), 0) AS units30d
       FROM shops s
       WHERE (? = '' OR lower(s.name) LIKE '%' || lower(?) || '%')
       LIMIT 200`,
      q,
      q,
    )) as Array<{
      id: string;
      name: string;
      productCount: number;
      avgRating: number | null;
      reviewCount: number;
      units30d: number;
    }>;

    if (rows.length === 0) return [];
    const maxUnits = Math.max(...rows.map((r) => r.units30d), 1);

    const scored = rows
      .map<ShopSearchHit>((r) => {
        const nameMatch = q
          ? r.name.toLowerCase().includes(q.toLowerCase())
            ? 1
            : 0
          : 0.5;
        const popularity = r.units30d / maxUnits;
        const rating = (r.avgRating ?? 0) / 5;
        const score = Math.min(
          1,
          nameMatch * 0.5 + popularity * 0.3 + rating * 0.2,
        );
        return {
          shopId: r.id,
          name: r.name,
          avgRating: r.avgRating ? Math.round(r.avgRating * 10) / 10 : 0,
          reviewCount: r.reviewCount,
          productCount: r.productCount,
          unitsSold30d: r.units30d,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, safe);

    return scored;
  }

  // ===========================================================================
  // Autocomplete suggestions — popular product names + trending queries
  // ===========================================================================
  async suggestions(prefix: string, limit = 8): Promise<Suggestion[]> {
    const p = (prefix ?? '').trim().toLowerCase();
    const safe = Math.max(1, Math.min(limit, 20));
    if (p.length === 0) return [];

    const products = (await this.prisma.$queryRawUnsafe(
      `SELECT p.name AS text,
              COALESCE(SUM(oi.quantity), 0) AS cnt
       FROM products p
       LEFT JOIN order_items oi ON oi.productId = p.id
       WHERE p.status = 'ACTIVE' AND lower(p.name) LIKE ? || '%'
       GROUP BY p.id
       ORDER BY cnt DESC
       LIMIT ?`,
      p,
      safe,
    )) as Array<{ text: string; cnt: number }>;

    const trending = (await this.prisma.$queryRawUnsafe(
      `SELECT query AS text, COUNT(*) AS cnt FROM search_queries
       WHERE lower(query) LIKE ? || '%' AND createdAt >= date('now','-7 days')
       GROUP BY lower(query)
       ORDER BY cnt DESC
       LIMIT ?`,
      p,
      safe,
    )) as Array<{ text: string; cnt: number }>;

    // Merge, dedupe (case-insensitive), prefer product names
    const seen = new Set<string>();
    const out: Suggestion[] = [];
    for (const x of products) {
      const k = x.text.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ text: x.text, kind: 'PRODUCT', count: x.cnt });
    }
    for (const x of trending) {
      const k = x.text.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ text: x.text, kind: 'TRENDING', count: x.cnt });
    }
    return out.slice(0, safe);
  }

  // ===========================================================================
  // Trending queries (admin analytics)
  // ===========================================================================
  async trendingQueries(limit = 30): Promise<TrendingQuery[]> {
    const safe = Math.max(1, Math.min(limit, 100));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT lower(query) AS query,
              COUNT(*) AS cnt,
              AVG(CASE WHEN resultCount = 0 THEN 1.0 ELSE 0 END) AS zeroRatio
       FROM search_queries
       WHERE createdAt >= date('now','-7 days')
       GROUP BY lower(query)
       ORDER BY cnt DESC
       LIMIT ?`,
      safe,
    )) as Array<{ query: string; cnt: number; zeroRatio: number }>;

    return rows.map((r) => ({
      query: r.query,
      count: r.cnt,
      zeroResultRatio: Math.max(0, Math.min(1, r.zeroRatio)),
    }));
  }

  async zeroResultQueries(limit = 30): Promise<TrendingQuery[]> {
    const safe = Math.max(1, Math.min(limit, 100));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT lower(query) AS query,
              COUNT(*) AS cnt,
              1.0 AS zeroRatio
       FROM search_queries
       WHERE createdAt >= date('now','-30 days') AND resultCount = 0
       GROUP BY lower(query)
       ORDER BY cnt DESC
       LIMIT ?`,
      safe,
    )) as Array<{ query: string; cnt: number }>;
    return rows.map((r) => ({
      query: r.query,
      count: r.cnt,
      zeroResultRatio: 1,
    }));
  }

  // ===========================================================================
  // Tracking
  // ===========================================================================
  async track(
    input: TrackSearchInput,
    userId: string | null,
  ): Promise<{ ok: true }> {
    await this.recordQuery(input.query, userId, input.resultCount);
    return { ok: true };
  }

  private async recordQuery(
    query: string,
    userId: string | null,
    resultCount: number,
  ): Promise<void> {
    const t0 = Date.now();
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO search_queries (id, query, userId, resultCount, createdAt)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        newId('sq'),
        query.trim(),
        userId,
        Math.max(0, resultCount),
      );
    } catch {
      // best-effort
    }
    void logModelRun(this.prisma, 'search.track', Date.now() - t0);
  }
}
