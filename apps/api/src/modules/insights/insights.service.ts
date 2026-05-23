import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreatorMatch,
  CustomerSegment,
  DemandForecastPoint,
  InsightAnomaly,
  PriceSuggestion,
  SalesTrendPoint,
  SegmentSummary,
  ShopInsightsOverview,
  TopProduct,
} from '../../shared/types';
import { measured } from '../../common/ai/model-runs';

const SEGMENT_LABELS: Record<CustomerSegment, { label: string; description: string }> = {
  CHAMPIONS: {
    label: 'แชมป์ (Champions)',
    description: 'ซื้อบ่อย ยอดสูง ซื้อเร็ว ๆ นี้ — รักษาไว้ด้วยสิทธิ VIP',
  },
  LOYAL: {
    label: 'ขาประจำ (Loyal)',
    description: 'ซื้อสม่ำเสมอ ส่งคูปองพิเศษ + แต้ม bonus',
  },
  NEW: {
    label: 'หน้าใหม่ (New)',
    description: 'เพิ่งสมัคร/ซื้อ 1-2 ครั้ง — สร้าง habit ด้วย welcome series',
  },
  AT_RISK: {
    label: 'เริ่มหาย (At Risk)',
    description: 'เคยซื้อบ่อยแต่หายไป 30-90 วัน — ส่ง win-back coupon',
  },
  LOST: {
    label: 'หายไปนาน (Lost)',
    description: 'ไม่ซื้อมา > 90 วัน — โปรแรง ๆ ดึงกลับ',
  },
  REGULAR: {
    label: 'ทั่วไป (Regular)',
    description: 'ไม่เข้าเกณฑ์พิเศษ',
  },
};

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // KPI overview — 30d (with deltas vs previous 30d)
  // ---------------------------------------------------------------------------
  async overview(
    ownerUserId: string,
    shopId: string,
    windowDays = 30,
  ): Promise<ShopInsightsOverview> {
    await this.assertShopOwner(ownerUserId, shopId);
    const win = Math.max(1, Math.min(windowDays, 365));
    const cur = await this.windowKPI(shopId, 0, win);
    const prev = await this.windowKPI(shopId, win, win);

    const refundRateBps =
      cur.orderCount > 0
        ? Math.round((cur.refundCount / cur.orderCount) * 10000)
        : 0;
    const gmvDeltaBps = ratioDeltaBps(cur.gmvCents, prev.gmvCents);
    const orderDeltaBps = ratioDeltaBps(cur.orderCount, prev.orderCount);

    let conversionHint = 'ขายปกติ';
    if (cur.orderCount === 0) conversionHint = 'ไม่มีออเดอร์ในช่วงนี้ — ลองโปรโมท';
    else if (gmvDeltaBps <= -2000) conversionHint = 'ยอดตกแรง (>20%) — ดู anomalies';
    else if (gmvDeltaBps >= 2000) conversionHint = 'ยอดพุ่ง (>20%) — เร่งสต๊อก';

    const rating = await this.shopRating(shopId);

    return {
      shopId,
      windowDays: win,
      gmvCents: cur.gmvCents,
      orderCount: cur.orderCount,
      uniqueCustomers: cur.uniqueCustomers,
      avgOrderValueCents:
        cur.orderCount > 0 ? Math.round(cur.gmvCents / cur.orderCount) : 0,
      refundCount: cur.refundCount,
      refundRateBps,
      conversionHint,
      gmvDeltaBps,
      orderDeltaBps,
      avgRating: rating.avg,
      reviewCount: rating.count,
    };
  }

  private async shopRating(
    shopId: string,
  ): Promise<{ avg: number; count: number }> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT AVG(rating) AS a, COUNT(*) AS c
       FROM reviews WHERE shopId = ? AND isHidden = 0`,
      shopId,
    )) as Array<{ a: number | null; c: number }>;
    const a = rows[0]?.a ?? 0;
    return {
      avg: a ? Math.round(a * 10) / 10 : 0,
      count: rows[0]?.c ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Daily revenue series (for sparkline)
  // ---------------------------------------------------------------------------
  async trend(
    ownerUserId: string,
    shopId: string,
    days = 14,
  ): Promise<SalesTrendPoint[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    const n = Math.max(1, Math.min(days, 90));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT date(createdAt) AS d,
              COALESCE(SUM(totalCents - COALESCE(discountCents, 0)), 0) AS gmv,
              COUNT(*) AS orders
       FROM orders
       WHERE shopId = ?
         AND status NOT IN ('CANCELLED')
         AND createdAt >= date('now', ?)
       GROUP BY d
       ORDER BY d ASC`,
      shopId,
      `-${n} days`,
    )) as Array<{ d: string; gmv: number; orders: number }>;

    // Fill missing days with zero for nicer chart
    const map = new Map(rows.map((r) => [r.d, r] as const));
    const out: SalesTrendPoint[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const found = map.get(key);
      out.push({
        date: key,
        gmvCents: found?.gmv ?? 0,
        orderCount: found?.orders ?? 0,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Demand forecast — next N days using 28-day history + DoW seasonality
  //
  // Algorithm (deterministic, no external ML):
  //   1. Pull 28-day history of (date → gmvCents, orderCount)
  //   2. Compute mean daily GMV `μ` and stddev `σ` over the window
  //   3. Compute day-of-week seasonal multipliers `s[0..6]` = avg(DoW) / μ
  //      (fallback to 1.0 when no data for that DoW)
  //   4. For each future day d:
  //         forecast(d) = μ * s[dow(d)]
  //         band(d)     = ±1.5σ * s[dow(d)]
  //   5. orderCount scaled by historical orders/GMV ratio
  // ---------------------------------------------------------------------------
  async forecast(
    ownerUserId: string,
    shopId: string,
    horizonDays = 7,
  ): Promise<DemandForecastPoint[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    return measured(this.prisma, 'insights.forecast', () =>
      this._forecast(shopId, horizonDays),
    );
  }

  private async _forecast(
    shopId: string,
    horizonDays: number,
  ): Promise<DemandForecastPoint[]> {
    const h = Math.max(1, Math.min(horizonDays, 14));
    const window = 28;

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT date(createdAt) AS d,
              COALESCE(SUM(totalCents - COALESCE(discountCents, 0)), 0) AS gmv,
              COUNT(*) AS orders
       FROM orders
       WHERE shopId = ?
         AND status NOT IN ('CANCELLED')
         AND createdAt >= date('now', ?)
       GROUP BY d
       ORDER BY d ASC`,
      shopId,
      `-${window} days`,
    )) as Array<{ d: string; gmv: number; orders: number }>;

    // Build per-day series with missing days filled as 0
    const map = new Map(rows.map((r) => [r.d, r] as const));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    interface DayRec {
      gmv: number;
      orders: number;
      dow: number;
    }
    const history: DayRec[] = [];
    for (let i = window; i >= 1; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const found = map.get(key);
      history.push({
        gmv: found?.gmv ?? 0,
        orders: found?.orders ?? 0,
        dow: d.getDay(),
      });
    }

    // mean + stddev
    const n = history.length;
    const meanGmv = history.reduce((s, x) => s + x.gmv, 0) / n;
    const variance =
      history.reduce((s, x) => s + (x.gmv - meanGmv) ** 2, 0) / Math.max(1, n - 1);
    const std = Math.sqrt(variance);

    const orderRatio =
      history.reduce((s, x) => s + x.orders, 0) /
      Math.max(1, history.reduce((s, x) => s + x.gmv, 0));

    // DoW seasonal multiplier (fallback 1.0 if no data)
    const dowSum = new Array<number>(7).fill(0);
    const dowCount = new Array<number>(7).fill(0);
    for (const r of history) {
      dowSum[r.dow] += r.gmv;
      dowCount[r.dow]++;
    }
    const seasonal: number[] = [];
    for (let i = 0; i < 7; i++) {
      const dowMean = dowCount[i] > 0 ? dowSum[i] / dowCount[i] : meanGmv;
      seasonal.push(meanGmv > 0 ? dowMean / meanGmv : 1);
    }

    const out: DemandForecastPoint[] = [];
    for (let i = 1; i <= h; i++) {
      const d = new Date(today.getTime() + i * 86_400_000);
      const dow = d.getDay();
      const s = seasonal[dow] || 1;
      const center = Math.max(0, meanGmv * s);
      const halfBand = 1.5 * std * s;
      const gmvCents = Math.round(center);
      const lowerCents = Math.max(0, Math.round(center - halfBand));
      const upperCents = Math.round(center + halfBand);
      out.push({
        date: d.toISOString().slice(0, 10),
        gmvCents,
        orderCount: Math.max(0, Math.round(gmvCents * orderRatio)),
        lowerCents,
        upperCents,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Top products (last 30d)
  // ---------------------------------------------------------------------------
  async topProducts(
    ownerUserId: string,
    shopId: string,
    limit = 10,
  ): Promise<TopProduct[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    const safe = Math.max(1, Math.min(limit, 50));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id AS productId, p.name, p.priceCents, p.stock,
              COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS units,
              COALESCE(SUM(CASE WHEN o.id IS NOT NULL
                                THEN oi.quantity * oi.unitPriceCents
                                ELSE 0 END), 0) AS gmv
       FROM products p
       LEFT JOIN order_items oi ON oi.productId = p.id
       LEFT JOIN orders o ON o.id = oi.orderId
         AND o.status NOT IN ('CANCELLED')
         AND o.createdAt >= date('now', '-30 days')
       WHERE p.shopId = ?
       GROUP BY p.id
       ORDER BY units DESC, gmv DESC
       LIMIT ?`,
      shopId,
      safe,
    )) as Array<{
      productId: string;
      name: string;
      priceCents: number;
      stock: number;
      units: number;
      gmv: number;
    }>;
    return rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      unitsSold: r.units,
      gmvCents: r.gmv,
      priceCents: r.priceCents,
      stock: r.stock,
    }));
  }

  // ---------------------------------------------------------------------------
  // Anomalies — WoW drops, refund surge, low-stock-on-hot, zero sales
  // ---------------------------------------------------------------------------
  async anomalies(
    ownerUserId: string,
    shopId: string,
  ): Promise<InsightAnomaly[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    const cur = await this.windowKPI(shopId, 0, 7);
    const prev = await this.windowKPI(shopId, 7, 7);
    const list: InsightAnomaly[] = [];

    if (cur.orderCount === 0 && prev.orderCount > 0) {
      list.push({
        kind: 'ZERO_SALES',
        severity: 'CRITICAL',
        message: 'สัปดาห์นี้ยังไม่มีออเดอร์ (สัปดาห์ก่อนมี ' + prev.orderCount + ')',
        refType: 'shop',
        refId: shopId,
        metricValue: 0,
      });
    } else {
      const gmvDelta = ratioDeltaBps(cur.gmvCents, prev.gmvCents);
      const orderDelta = ratioDeltaBps(cur.orderCount, prev.orderCount);
      if (gmvDelta <= -2000 && prev.gmvCents > 0) {
        list.push({
          kind: 'GMV_DROP_WOW',
          severity: gmvDelta <= -5000 ? 'CRITICAL' : 'WARN',
          message: `ยอดขายลด ${(Math.abs(gmvDelta) / 100).toFixed(1)}% เทียบสัปดาห์ก่อน`,
          refType: 'shop',
          refId: shopId,
          metricValue: gmvDelta,
        });
      }
      if (orderDelta <= -2000 && prev.orderCount > 0) {
        list.push({
          kind: 'ORDER_DROP_WOW',
          severity: orderDelta <= -5000 ? 'CRITICAL' : 'WARN',
          message: `จำนวนออเดอร์ลด ${(Math.abs(orderDelta) / 100).toFixed(1)}% เทียบสัปดาห์ก่อน`,
          refType: 'shop',
          refId: shopId,
          metricValue: orderDelta,
        });
      }
    }

    const refundRate30d = await this.refundRateBps(shopId, 30);
    if (refundRate30d >= 1500) {
      list.push({
        kind: 'REFUND_SURGE',
        severity: refundRate30d >= 3000 ? 'CRITICAL' : 'WARN',
        message: `อัตราคืนเงิน ${(refundRate30d / 100).toFixed(1)}% สูงกว่าปกติ`,
        refType: 'shop',
        refId: shopId,
        metricValue: refundRate30d,
      });
    }

    // Low stock on hot products
    const hotLowStock = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.name, p.stock,
              COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS units
       FROM products p
       LEFT JOIN order_items oi ON oi.productId = p.id
       LEFT JOIN orders o ON o.id = oi.orderId
         AND o.status NOT IN ('CANCELLED')
         AND o.createdAt >= date('now', '-14 days')
       WHERE p.shopId = ? AND p.status = 'ACTIVE'
       GROUP BY p.id
       HAVING units >= 5 AND p.stock <= 5
       ORDER BY units DESC
       LIMIT 5`,
      shopId,
    )) as Array<{ id: string; name: string; stock: number; units: number }>;
    for (const r of hotLowStock) {
      list.push({
        kind: 'LOW_STOCK_HOT',
        severity: r.stock === 0 ? 'CRITICAL' : 'WARN',
        message: `"${r.name}" ขายดี (${r.units} ชิ้น/2 สัปดาห์) แต่เหลือ ${r.stock} ชิ้น`,
        refType: 'product',
        refId: r.id,
        metricValue: r.stock,
      });
    }

    return list;
  }

  // ---------------------------------------------------------------------------
  // Price suggestions — outliers vs category (here: vs platform median per "shop")
  // We use the median of all ACTIVE products' price as a baseline (no category yet)
  // ---------------------------------------------------------------------------
  async priceSuggestions(
    ownerUserId: string,
    shopId: string,
  ): Promise<PriceSuggestion[]> {
    await this.assertShopOwner(ownerUserId, shopId);

    // Platform-wide median price (simple proxy for "category median")
    const allPrices = (await this.prisma.$queryRawUnsafe(
      `SELECT priceCents FROM products WHERE status = 'ACTIVE' ORDER BY priceCents ASC`,
    )) as Array<{ priceCents: number }>;
    if (allPrices.length === 0) return [];
    const median = allPrices[Math.floor(allPrices.length / 2)].priceCents;

    const myProducts = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.name, p.priceCents,
              COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS units
       FROM products p
       LEFT JOIN order_items oi ON oi.productId = p.id
       LEFT JOIN orders o ON o.id = oi.orderId
         AND o.status NOT IN ('CANCELLED')
         AND o.createdAt >= date('now', '-30 days')
       WHERE p.shopId = ? AND p.status = 'ACTIVE'
       GROUP BY p.id`,
      shopId,
    )) as Array<{
      id: string;
      name: string;
      priceCents: number;
      units: number;
    }>;

    const suggestions: PriceSuggestion[] = [];
    for (const p of myProducts) {
      const ratio = p.priceCents / median;
      if (ratio >= 1.5 && p.units === 0) {
        // Overpriced + not selling → suggest -15%
        const newPrice = Math.round(p.priceCents * 0.85);
        suggestions.push({
          productId: p.id,
          name: p.name,
          currentPriceCents: p.priceCents,
          categoryMedianCents: median,
          suggestedPriceCents: newPrice,
          rationale: 'ราคาสูงกว่า median แพลตฟอร์ม 50% และยังไม่มียอดขาย — ลองลด 15%',
          direction: 'DECREASE',
        });
      } else if (ratio <= 0.5 && p.units >= 10) {
        // Underpriced + selling well → suggest +15%
        const newPrice = Math.round(p.priceCents * 1.15);
        suggestions.push({
          productId: p.id,
          name: p.name,
          currentPriceCents: p.priceCents,
          categoryMedianCents: median,
          suggestedPriceCents: newPrice,
          rationale: 'ราคาต่ำกว่า median ครึ่งหนึ่งและขายดี — ลองขึ้น 15%',
          direction: 'INCREASE',
        });
      }
    }
    return suggestions;
  }

  // ---------------------------------------------------------------------------
  // Customer segmentation (RFM) — group shop's customers
  // Recency = days since last order
  // Frequency = total order count
  // Monetary = total GMV (net of discounts)
  // ---------------------------------------------------------------------------
  async segments(
    ownerUserId: string,
    shopId: string,
  ): Promise<SegmentSummary[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    return measured(this.prisma, 'insights.segments', () =>
      this._segments(shopId),
    );
  }

  private async _segments(shopId: string): Promise<SegmentSummary[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT o.customerId,
              u.email,
              COUNT(*) AS freq,
              COALESCE(SUM(o.totalCents - COALESCE(o.discountCents, 0)), 0) AS gmv,
              julianday('now') - julianday(MAX(o.createdAt)) AS recencyDays
       FROM orders o
       JOIN users u ON u.id = o.customerId
       WHERE o.shopId = ?
         AND o.status NOT IN ('CANCELLED')
       GROUP BY o.customerId`,
      shopId,
    )) as Array<{
      customerId: string;
      email: string;
      freq: number;
      gmv: number;
      recencyDays: number;
    }>;

    if (rows.length === 0) {
      return Object.entries(SEGMENT_LABELS).map(([seg, meta]) => ({
        segment: seg as CustomerSegment,
        label: meta.label,
        count: 0,
        gmvCents: 0,
        description: meta.description,
        sampleEmails: [],
      }));
    }

    // shop-level GMV median for monetary threshold
    const gmvs = rows.map((r) => r.gmv).sort((a, b) => a - b);
    const medianGmv = gmvs[Math.floor(gmvs.length / 2)];

    const buckets = new Map<
      CustomerSegment,
      { count: number; gmvCents: number; emails: string[] }
    >();

    const seg = (r: (typeof rows)[number]): CustomerSegment => {
      const R = Math.floor(r.recencyDays);
      const F = r.freq;
      const M = r.gmv;
      if (R > 90) return 'LOST';
      if (R <= 30 && F >= 3 && M >= medianGmv * 2) return 'CHAMPIONS';
      if (F >= 3 && M >= medianGmv) return 'LOYAL';
      if (R <= 14 && F <= 2) return 'NEW';
      if (F >= 2 && R > 30 && R <= 90) return 'AT_RISK';
      return 'REGULAR';
    };

    for (const r of rows) {
      const s = seg(r);
      let b = buckets.get(s);
      if (!b) {
        b = { count: 0, gmvCents: 0, emails: [] };
        buckets.set(s, b);
      }
      b.count++;
      b.gmvCents += r.gmv;
      if (b.emails.length < 5) b.emails.push(r.email);
    }

    const order: CustomerSegment[] = [
      'CHAMPIONS',
      'LOYAL',
      'NEW',
      'AT_RISK',
      'LOST',
      'REGULAR',
    ];
    return order.map((s) => {
      const meta = SEGMENT_LABELS[s];
      const b = buckets.get(s);
      return {
        segment: s,
        label: meta.label,
        count: b?.count ?? 0,
        gmvCents: b?.gmvCents ?? 0,
        description: meta.description,
        sampleEmails: b?.emails ?? [],
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Creator matches — find creators whose links/posts overlap with shop's catalog
  // ---------------------------------------------------------------------------
  async creatorMatches(
    ownerUserId: string,
    shopId: string,
    limit = 5,
  ): Promise<CreatorMatch[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    const safe = Math.max(1, Math.min(limit, 20));

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT cp.id AS creatorId,
              cp.displayName AS displayName,
              COUNT(DISTINCT cl.id) AS activeLinks,
              COALESCE(SUM(cl.clickCount), 0) AS totalClicks,
              SUM(CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END) AS shopOverlap
       FROM creator_profiles cp
       LEFT JOIN creator_links cl ON cl.creatorId = cp.id AND cl.active = 1
       LEFT JOIN products p ON p.id = cl.productId AND p.shopId = ?
       WHERE cp.status = 'ACTIVE'
       GROUP BY cp.id
       ORDER BY shopOverlap DESC, totalClicks DESC, activeLinks DESC
       LIMIT ?`,
      shopId,
      safe,
    )) as Array<{
      creatorId: string;
      displayName: string | null;
      activeLinks: number;
      totalClicks: number;
      shopOverlap: number;
    }>;

    const maxClicks = Math.max(...rows.map((r) => r.totalClicks), 1);
    return rows.map((r) => {
      const clickScore = r.totalClicks / maxClicks;
      const linkScore = Math.min(1, r.activeLinks / 5);
      const score = Math.min(1, clickScore * 0.6 + linkScore * 0.4);
      return {
        creatorId: r.creatorId,
        displayName: r.displayName ?? 'Creator',
        matchScore: score,
        reason:
          r.activeLinks > 0
            ? `มี ${r.activeLinks} ลิงก์, คลิก ${r.totalClicks} ครั้ง`
            : 'Creator พร้อมโปรโมท — ยังไม่มีลิงก์',
        activeLinks: r.activeLinks,
        totalClicks: r.totalClicks,
      };
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async windowKPI(
    shopId: string,
    offsetDays: number,
    spanDays: number,
  ): Promise<{
    gmvCents: number;
    orderCount: number;
    uniqueCustomers: number;
    refundCount: number;
  }> {
    const endOffset = `-${offsetDays} days`;
    const startOffset = `-${offsetDays + spanDays} days`;
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(totalCents - COALESCE(discountCents, 0)), 0) AS gmv,
              COUNT(*) AS orders,
              COUNT(DISTINCT customerId) AS customers,
              SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) AS refunds
       FROM orders
       WHERE shopId = ?
         AND status NOT IN ('CANCELLED')
         AND createdAt >= date('now', ?)
         AND createdAt < date('now', ?)`,
      shopId,
      startOffset,
      endOffset,
    )) as Array<{
      gmv: number;
      orders: number;
      customers: number;
      refunds: number;
    }>;
    const r = rows[0];
    return {
      gmvCents: r?.gmv ?? 0,
      orderCount: r?.orders ?? 0,
      uniqueCustomers: r?.customers ?? 0,
      refundCount: r?.refunds ?? 0,
    };
  }

  private async refundRateBps(shopId: string, days: number): Promise<number> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) AS refunds
       FROM orders
       WHERE shopId = ?
         AND createdAt >= date('now', ?)`,
      shopId,
      `-${days} days`,
    )) as Array<{ total: number; refunds: number }>;
    const r = rows[0];
    if (!r || r.total === 0) return 0;
    return Math.round((r.refunds / r.total) * 10000);
  }

  private async assertShopOwner(userId: string, shopId: string): Promise<void> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ownerId FROM shops WHERE id = ?`,
      shopId,
    )) as Array<{ ownerId: string }>;
    if (rows.length === 0) throw new NotFoundException('ไม่พบร้าน');
    if (rows[0].ownerId !== userId) {
      throw new ForbiddenException('ไม่ใช่เจ้าของร้าน');
    }
  }
}

function ratioDeltaBps(now: number, prev: number): number {
  if (prev === 0) return now > 0 ? 10000 : 0;
  return Math.round(((now - prev) / prev) * 10000);
}
