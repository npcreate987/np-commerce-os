import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ApplyCouponInput,
  Coupon,
  CouponKind,
  CouponQuote,
  CreateCouponInput,
} from '../../shared/types';

interface DbCoupon {
  id: string;
  shopId: string | null;
  code: string;
  title: string;
  description: string | null;
  kind: string;
  value: number;
  minSpendCents: number;
  maxDiscountCents: number;
  totalLimit: number;
  perUserLimit: number;
  used: number;
  startsAt: string;
  endsAt: string | null;
  active: number;
  createdAt: string;
  updatedAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function toCoupon(d: DbCoupon): Coupon {
  return {
    id: d.id,
    shopId: d.shopId,
    code: d.code,
    title: d.title,
    description: d.description,
    kind: d.kind as CouponKind,
    value: d.value,
    minSpendCents: d.minSpendCents,
    maxDiscountCents: d.maxDiscountCents,
    totalLimit: d.totalLimit,
    perUserLimit: d.perUserLimit,
    used: d.used,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    active: d.active === 1,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  // -------- Public discovery --------

  /**
   * คูปองที่ใช้ได้สาธารณะ (platform-wide หรือของร้านที่ระบุ)
   */
  async listAvailable(shopId?: string): Promise<Coupon[]> {
    const nowIso = new Date().toISOString();
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM coupons
       WHERE active = 1
         AND startsAt <= ?
         AND (endsAt IS NULL OR endsAt >= ?)
         AND (shopId IS NULL ${shopId ? 'OR shopId = ?' : ''})
       ORDER BY createdAt DESC
       LIMIT 100`,
      ...(shopId ? [nowIso, nowIso, shopId] : [nowIso, nowIso]),
    )) as DbCoupon[];
    return rows.map(toCoupon);
  }

  // -------- Merchant management --------

  async listForShop(ownerUserId: string, shopId: string): Promise<Coupon[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM coupons WHERE shopId = ? ORDER BY createdAt DESC`,
      shopId,
    )) as DbCoupon[];
    return rows.map(toCoupon);
  }

  async create(ownerUserId: string, input: CreateCouponInput): Promise<Coupon> {
    if (input.shopId) {
      await this.assertShopOwner(ownerUserId, input.shopId);
    }
    if (input.kind === 'PERCENT' && (input.value <= 0 || input.value > 10000)) {
      throw new BadRequestException(
        'PERCENT value ต้องอยู่ระหว่าง 1-10000 basis points (0.01% - 100%)',
      );
    }
    const codeUpper = input.code.toUpperCase();
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM coupons WHERE code = ?`,
      codeUpper,
    )) as Array<{ id: string }>;
    if (existing.length > 0) {
      throw new BadRequestException('รหัสคูปองนี้ถูกใช้แล้ว');
    }

    const id = newId('cou');
    const startsAt = input.startsAt ?? new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO coupons
        (id, shopId, code, title, description, kind, value, minSpendCents,
         maxDiscountCents, totalLimit, perUserLimit, used, startsAt, endsAt, active,
         createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      input.shopId ?? null,
      codeUpper,
      input.title,
      input.description ?? null,
      input.kind,
      input.value,
      input.minSpendCents,
      input.maxDiscountCents,
      input.totalLimit,
      input.perUserLimit,
      startsAt,
      input.endsAt ?? null,
    );
    const created = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM coupons WHERE id = ?`,
      id,
    )) as DbCoupon[];
    return toCoupon(created[0]);
  }

  async toggle(ownerUserId: string, couponId: string, active: boolean): Promise<Coupon> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM coupons WHERE id = ?`,
      couponId,
    )) as DbCoupon[];
    if (rows.length === 0) throw new NotFoundException('ไม่พบคูปอง');
    const c = rows[0];
    if (c.shopId) {
      await this.assertShopOwner(ownerUserId, c.shopId);
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE coupons SET active = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      active ? 1 : 0,
      couponId,
    );
    const updated = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM coupons WHERE id = ?`,
      couponId,
    )) as DbCoupon[];
    return toCoupon(updated[0]);
  }

  // -------- Apply / redeem --------

  /**
   * Quote ส่วนลด — ไม่ได้บันทึก redemption (เรียกจาก checkout)
   */
  async quote(userId: string, input: ApplyCouponInput): Promise<CouponQuote> {
    const code = input.code.toUpperCase();
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM coupons WHERE code = ? AND active = 1`,
      code,
    )) as DbCoupon[];
    if (rows.length === 0) throw new NotFoundException('รหัสคูปองไม่ถูกต้อง');
    const c = rows[0];

    const now = new Date();
    if (new Date(c.startsAt) > now) {
      throw new BadRequestException('คูปองยังไม่เริ่ม');
    }
    if (c.endsAt && new Date(c.endsAt) < now) {
      throw new BadRequestException('คูปองหมดอายุแล้ว');
    }
    if (c.shopId && input.shopId && c.shopId !== input.shopId) {
      throw new BadRequestException('คูปองนี้ใช้กับร้านนี้ไม่ได้');
    }
    if (input.subtotalCents < c.minSpendCents) {
      throw new BadRequestException(
        `ต้องสั่งซื้อขั้นต่ำ ${(c.minSpendCents / 100).toFixed(2)} บาท`,
      );
    }
    if (c.totalLimit > 0 && c.used >= c.totalLimit) {
      throw new BadRequestException('คูปองถูกใช้ครบจำนวนแล้ว');
    }
    if (c.perUserLimit > 0) {
      const userUses = (await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS cnt FROM coupon_redemptions
         WHERE couponId = ? AND userId = ?`,
        c.id,
        userId,
      )) as Array<{ cnt: number }>;
      if (userUses[0].cnt >= c.perUserLimit) {
        throw new BadRequestException('คุณใช้คูปองนี้ครบจำนวนแล้ว');
      }
    }

    let discountCents = 0;
    let freeShipping = false;
    if (c.kind === 'PERCENT') {
      discountCents = Math.floor((input.subtotalCents * c.value) / 10000);
      if (c.maxDiscountCents > 0 && discountCents > c.maxDiscountCents) {
        discountCents = c.maxDiscountCents;
      }
    } else if (c.kind === 'FIXED') {
      discountCents = Math.min(c.value, input.subtotalCents);
    } else if (c.kind === 'FREE_SHIPPING') {
      discountCents = input.shippingCents;
      freeShipping = true;
    }

    return {
      couponId: c.id,
      code: c.code,
      kind: c.kind as CouponKind,
      discountCents,
      freeShipping,
      message:
        c.kind === 'FREE_SHIPPING'
          ? 'ส่งฟรี!'
          : `ลด ${(discountCents / 100).toFixed(2)} บาท`,
    };
  }

  /**
   * บันทึกการใช้ — เรียกตอน confirmPayment (idempotent ผ่าน unique (couponId, orderId))
   */
  async redeem(
    userId: string,
    couponId: string,
    orderId: string,
    discountCents: number,
  ): Promise<void> {
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM coupon_redemptions WHERE couponId = ? AND orderId = ?`,
      couponId,
      orderId,
    )) as Array<{ id: string }>;
    if (existing.length > 0) return;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO coupon_redemptions
        (id, couponId, userId, orderId, discountCents, createdAt)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      newId('red'),
      couponId,
      userId,
      orderId,
      discountCents,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE coupons SET used = used + 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      couponId,
    );
  }

  // -------- Helpers --------

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
