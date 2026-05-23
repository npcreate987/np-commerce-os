import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  LogisticsIssue,
  OrderRisk,
  RiskFactor,
  ShopRisk,
} from '../../shared/types';

@Injectable()
export class RiskService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Shop risk — rule-based scoring (0-100)
  // ---------------------------------------------------------------------------
  async shops(limit = 50): Promise<ShopRisk[]> {
    const safe = Math.max(1, Math.min(limit, 200));
    const shops = (await this.prisma.$queryRawUnsafe(
      `SELECT s.id, s.name, s.createdAt, u.email AS ownerEmail
       FROM shops s
       JOIN users u ON u.id = s.ownerId
       ORDER BY s.createdAt DESC
       LIMIT ?`,
      safe,
    )) as Array<{
      id: string;
      name: string;
      createdAt: string;
      ownerEmail: string;
    }>;

    const out: ShopRisk[] = [];
    for (const s of shops) {
      const stats = await this.shopStats(s.id);
      const ageDays = daysBetween(new Date(s.createdAt), new Date());
      const factors = this.evalShopFactors(stats, ageDays);
      const score = scoreFromFactors(factors);
      out.push({
        shopId: s.id,
        shopName: s.name,
        ownerEmail: s.ownerEmail,
        score,
        level: levelFromScore(score),
        factors,
        gmv30dCents: stats.gmvCents,
        orders30d: stats.orderCount,
        disputes30d: stats.disputes,
        refunds30d: stats.refunds,
        accountAgeDays: ageDays,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  async shopDetail(shopId: string): Promise<ShopRisk | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT s.id, s.name, s.createdAt, u.email AS ownerEmail
       FROM shops s JOIN users u ON u.id = s.ownerId WHERE s.id = ? LIMIT 1`,
      shopId,
    )) as Array<{
      id: string;
      name: string;
      createdAt: string;
      ownerEmail: string;
    }>;
    if (rows.length === 0) return null;
    const s = rows[0];
    const stats = await this.shopStats(s.id);
    const ageDays = daysBetween(new Date(s.createdAt), new Date());
    const factors = this.evalShopFactors(stats, ageDays);
    const score = scoreFromFactors(factors);
    return {
      shopId: s.id,
      shopName: s.name,
      ownerEmail: s.ownerEmail,
      score,
      level: levelFromScore(score),
      factors,
      gmv30dCents: stats.gmvCents,
      orders30d: stats.orderCount,
      disputes30d: stats.disputes,
      refunds30d: stats.refunds,
      accountAgeDays: ageDays,
    };
  }

  // ---------------------------------------------------------------------------
  // Suspicious orders — rule-based flags
  // ---------------------------------------------------------------------------
  async suspiciousOrders(limit = 50): Promise<OrderRisk[]> {
    const safe = Math.max(1, Math.min(limit, 200));
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT o.id, o.shopId, o.customerId, o.totalCents, o.createdAt,
              s.name AS shopName, u.email AS customerEmail, u.createdAt AS userCreatedAt
       FROM orders o
       JOIN shops s ON s.id = o.shopId
       JOIN users u ON u.id = o.customerId
       WHERE o.createdAt >= date('now', '-30 days')
       ORDER BY o.createdAt DESC
       LIMIT ?`,
      safe * 4,
    )) as Array<{
      id: string;
      shopId: string;
      customerId: string;
      totalCents: number;
      createdAt: string;
      shopName: string;
      customerEmail: string;
      userCreatedAt: string;
    }>;

    const scored: OrderRisk[] = [];
    for (const o of rows) {
      const flags: string[] = [];
      let s = 0;
      const userAgeDays = daysBetween(new Date(o.userCreatedAt), new Date());
      if (o.totalCents >= 500_000) {
        flags.push(`ยอดสูง (${(o.totalCents / 100).toLocaleString()} บาท)`);
        s += 30;
      }
      if (userAgeDays <= 1 && o.totalCents >= 100_000) {
        flags.push('บัญชีใหม่ + ยอดสูง');
        s += 35;
      } else if (userAgeDays <= 1) {
        flags.push('บัญชีใหม่ (<24 ชม.)');
        s += 10;
      }

      // velocity: count user's orders in the last hour around this one
      const burst = (await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS cnt FROM orders
         WHERE customerId = ?
           AND createdAt BETWEEN datetime(?, '-30 minutes') AND datetime(?, '+30 minutes')`,
        o.customerId,
        o.createdAt,
        o.createdAt,
      )) as Array<{ cnt: number }>;
      if (burst[0]?.cnt && burst[0].cnt >= 4) {
        flags.push(`สั่ง ${burst[0].cnt} ออเดอร์ภายใน 1 ชม.`);
        s += 25;
      }

      if (flags.length === 0) continue;
      const score = Math.min(100, s);
      scored.push({
        orderId: o.id,
        customerEmail: o.customerEmail,
        shopId: o.shopId,
        shopName: o.shopName,
        totalCents: o.totalCents,
        createdAt: o.createdAt,
        score,
        level: levelFromScore(score),
        flags,
      });
      if (scored.length >= safe) break;
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  // ---------------------------------------------------------------------------
  // Logistics issues — group shipments by carrier, compute late/claim rates
  //
  // schema notes:
  //   shipments has carrierId (FK), status, createdAt, updatedAt (no deliveredAt)
  //   use updatedAt as a proxy for delivered timestamp when status='DELIVERED'
  // ---------------------------------------------------------------------------
  async logisticsIssues(): Promise<LogisticsIssue[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT c.code AS carrierCode,
              c.name AS carrierName,
              COUNT(*) AS total,
              SUM(CASE WHEN s.status = 'DELIVERED'
                    AND (julianday(s.updatedAt) - julianday(s.createdAt)) > 3
                  THEN 1 ELSE 0 END) AS late,
              AVG(CASE WHEN s.status = 'DELIVERED'
                    THEN (julianday(s.updatedAt) - julianday(s.createdAt)) * 24
                  ELSE NULL END) AS avgHours
       FROM shipments s
       JOIN carriers c ON c.id = s.carrierId
       WHERE s.createdAt >= date('now', '-30 days')
       GROUP BY c.id
       ORDER BY late DESC, total DESC`,
    )) as Array<{
      carrierCode: string;
      carrierName: string | null;
      total: number;
      late: number;
      avgHours: number | null;
    }>;

    return rows.map((r) => {
      const lateRateBps = r.total > 0 ? Math.round((r.late / r.total) * 10000) : 0;
      const level: 'LOW' | 'MEDIUM' | 'HIGH' =
        lateRateBps >= 3000 ? 'HIGH' : lateRateBps >= 1500 ? 'MEDIUM' : 'LOW';
      return {
        carrierCode: r.carrierCode,
        carrierName: r.carrierName ?? r.carrierCode,
        shipments30d: r.total,
        lateRateBps,
        claimRateBps: 0, // requires shipments claim table — future
        avgLeadHours: Math.round(r.avgHours ?? 0),
        level,
        note:
          level === 'HIGH'
            ? 'ส่งช้าเกิน 30% ของขนส่ง — พิจารณาเปลี่ยน'
            : level === 'MEDIUM'
              ? 'ส่งช้าระหว่าง 15-30% — เฝ้าระวัง'
              : 'ปกติ',
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async shopStats(shopId: string): Promise<{
    gmvCents: number;
    orderCount: number;
    disputes: number;
    refunds: number;
    avgRating: number;
    reviewCount: number;
  }> {
    const ord = (await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(totalCents - COALESCE(discountCents, 0)), 0) AS gmv,
              COUNT(*) AS orders,
              SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) AS refunds
       FROM orders
       WHERE shopId = ? AND createdAt >= date('now', '-30 days')`,
      shopId,
    )) as Array<{ gmv: number; orders: number; refunds: number }>;

    const disp = (await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS cnt FROM disputes d
       JOIN orders o ON o.id = d.orderId
       WHERE o.shopId = ? AND d.createdAt >= date('now', '-30 days')`,
      shopId,
    )) as Array<{ cnt: number }>;

    const rat = (await this.prisma.$queryRawUnsafe(
      `SELECT AVG(rating) AS a, COUNT(*) AS c
       FROM reviews WHERE shopId = ? AND isHidden = 0`,
      shopId,
    )) as Array<{ a: number | null; c: number }>;

    return {
      gmvCents: ord[0]?.gmv ?? 0,
      orderCount: ord[0]?.orders ?? 0,
      refunds: ord[0]?.refunds ?? 0,
      disputes: disp[0]?.cnt ?? 0,
      avgRating: rat[0]?.a ?? 0,
      reviewCount: rat[0]?.c ?? 0,
    };
  }

  private evalShopFactors(
    s: {
      gmvCents: number;
      orderCount: number;
      disputes: number;
      refunds: number;
      avgRating: number;
      reviewCount: number;
    },
    ageDays: number,
  ): RiskFactor[] {
    const refundRate = s.orderCount > 0 ? s.refunds / s.orderCount : 0;
    const disputeRate = s.orderCount > 0 ? s.disputes / s.orderCount : 0;
    const factors: RiskFactor[] = [
      {
        key: 'refund_rate',
        label: 'อัตราคืนเงิน 30 วัน',
        value: Math.round(refundRate * 10000) / 100,
        threshold: 15,
        weight: 30,
        triggered: refundRate > 0.15,
      },
      {
        key: 'dispute_rate',
        label: 'อัตราเปิดเคส 30 วัน',
        value: Math.round(disputeRate * 10000) / 100,
        threshold: 10,
        weight: 30,
        triggered: disputeRate > 0.1,
      },
      {
        key: 'new_account_high_gmv',
        label: 'บัญชีใหม่ + GMV สูง',
        value: ageDays,
        threshold: 14,
        weight: 25,
        triggered: ageDays <= 14 && s.gmvCents >= 1_000_000,
      },
      {
        key: 'no_sales',
        label: 'ไม่มียอดขายเลย',
        value: s.orderCount,
        threshold: 1,
        weight: 5,
        triggered: ageDays >= 30 && s.orderCount === 0,
      },
      {
        key: 'poor_rating',
        label: 'รีวิวเฉลี่ยต่ำ (≤3.0)',
        value: Math.round(s.avgRating * 10) / 10,
        threshold: 3,
        weight: 20,
        triggered: s.reviewCount >= 3 && s.avgRating > 0 && s.avgRating <= 3,
      },
    ];
    return factors;
  }
}

// ---- pure helpers ----

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}

function scoreFromFactors(factors: RiskFactor[]): number {
  const sum = factors.reduce((acc, f) => acc + (f.triggered ? f.weight : 0), 0);
  return Math.min(100, sum);
}

function levelFromScore(s: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (s >= 60) return 'HIGH';
  if (s >= 30) return 'MEDIUM';
  return 'LOW';
}
