import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCheckoutInput, Order } from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { LogisticsService } from '../logistics/logistics.service';
import { CreatorService } from '../creator/creator.service';
import { CouponService } from '../coupon/coupon.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

const FLAT_SHIPPING_CENTS = 5000;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly logistics: LogisticsService,
    private readonly creators: CreatorService,
    private readonly coupons: CouponService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async create(userId: string, input: CreateCheckoutInput): Promise<Order[]> {
    const cart = await this.cart.getOrCreate(userId);
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const productIds = cart.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productById = new Map(products.map((p) => [p.id, p]));

    const itemsByShop = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
      const product = productById.get(item.productId);
      if (!product) throw new BadRequestException('Product missing');
      if (product.stock < item.quantity) {
        throw new BadRequestException(`Insufficient stock for ${product.name}`);
      }
      const list = itemsByShop.get(product.shopId) ?? [];
      list.push(item);
      itemsByShop.set(product.shopId, list);
    }

    const createdOrders: Order[] = [];

    // ---- Phase 5: split coupon + loyalty discount proportionally per shop ----
    const totalSubtotal = Array.from(itemsByShop.values()).reduce(
      (s, list) => s + list.reduce((x, it) => x + it.unitPriceCents * it.quantity, 0),
      0,
    );

    // (Phase 5 fix #4) Clamp loyalty redeem server-side. Even if frontend sends a
    // bigger number, we never let a customer burn more points than their cart can
    // absorb (1 point = 100 cents = 1 บาท). Coupon can stack on top, but loyalty
    // is capped to subtotal alone here for simplicity (coupon discount is computed
    // per-shop later, so clamping against full discount would over-restrict).
    const requestedRedeemPoints = Math.max(0, Math.floor(input.redeemPoints ?? 0));
    const maxRedeemPointsByCart = Math.floor(totalSubtotal / 100);
    const clampedRedeemPoints = Math.min(requestedRedeemPoints, maxRedeemPointsByCart);

    // (Phase 5 fix #3) DEFER loyalty point deduction until orders are committed.
    // We compute the discount value upfront, then call `loyalty.redeem` only after
    // all orders have been created. If anything earlier fails, points are NOT lost.
    // We still validate the user has enough points up front to fail fast.
    let loyaltyDiscountCents = 0;
    if (clampedRedeemPoints > 0) {
      const account = await this.loyalty.getOrCreate(userId);
      if (account.points < clampedRedeemPoints) {
        throw new BadRequestException('แต้มไม่พอ');
      }
      loyaltyDiscountCents = clampedRedeemPoints * 100;
    }

    for (const [shopId, items] of itemsByShop) {
      const subtotalCents = items.reduce((s, x) => s + x.unitPriceCents * x.quantity, 0);

      // Compute shipping via Logistics if carrier supplied; else fallback
      let shippingCents = FLAT_SHIPPING_CENTS;
      let carrierCode: string | null = null;
      if (input.carrierCode) {
        const quote = await this.logistics.quoteByCode(input.carrierCode, subtotalCents);
        shippingCents = quote.costCents;
        carrierCode = quote.carrierCode;
      }

      // ---- Apply coupon (per-shop or platform-wide) ----
      // (Phase 5 fix #2) For FREE_SHIPPING coupons, the discount IS the shipping
      // (we zero shippingCents below). It must NOT also be subtracted from subtotal.
      let couponDiscountCents = 0;
      let couponId: string | null = null;
      let couponCode: string | null = null;
      let freeShipping = false;
      if (input.couponCode) {
        try {
          const quote = await this.coupons.quote(userId, {
            code: input.couponCode,
            subtotalCents,
            shippingCents,
            shopId,
          });
          couponId = quote.couponId;
          couponCode = quote.code;
          freeShipping = quote.freeShipping;
          // For FREE_SHIPPING: discount is realized via shippingCents=0, NOT via subtotal cut
          couponDiscountCents = quote.freeShipping ? 0 : quote.discountCents;
        } catch {
          // ถ้าใช้ไม่ได้กับร้านนี้ ก็ข้าม (เช่น คูปอง shop อื่น)
        }
      }
      if (freeShipping) shippingCents = 0;

      // ---- Apply loyalty discount (split proportional to subtotal across shops) ----
      const loyaltyShare =
        totalSubtotal > 0
          ? Math.floor((loyaltyDiscountCents * subtotalCents) / totalSubtotal)
          : 0;

      // Cap subtotal-affecting discount so totalCents never goes negative on goods.
      // Shipping coupon already handled separately above.
      const subtotalDiscountCents = Math.min(
        subtotalCents,
        couponDiscountCents + loyaltyShare,
      );
      const totalCents = subtotalCents - subtotalDiscountCents + shippingCents;
      const redeemPointsForShop =
        totalSubtotal > 0
          ? Math.floor((clampedRedeemPoints * subtotalCents) / totalSubtotal)
          : 0;

      // (Phase 5 fix #5) Coupon redeem failure must NOT be silently swallowed.
      // If the coupon hits a hard limit between quote and redeem, the whole
      // checkout for this shop should fail so the customer doesn't get a free
      // discount that wasn't recorded.
      await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            customerId: userId,
            shopId,
            status: 'PENDING_PAYMENT',
            subtotalCents,
            shippingCents,
            totalCents,
            shippingAddressJson: JSON.stringify(input.shippingAddress),
            items: {
              create: items.map((it) => ({
                productId: it.productId,
                productName: it.productName,
                unitPriceCents: it.unitPriceCents,
                quantity: it.quantity,
                subtotalCents: it.unitPriceCents * it.quantity,
              })),
            },
          },
          include: { items: true },
        });

        // Phase 20.1 — ported from `$executeRawUnsafe` with SQLite `?`
        // placeholders to Prisma client `update`. `carrierCode` /
        // `couponCode` / `couponId` / `discountCents` / `redeemPoints`
        // are no longer "additive columns" — they're first-class fields
        // on the Order Prisma model, so a typed update is the right
        // surface. We coalesce the two paths into one update so a
        // checkout that uses both a carrier AND a coupon only emits a
        // single UPDATE round-trip.
        const orderPatch: {
          carrierCode?: string | null;
          couponCode?: string | null;
          couponId?: string | null;
          discountCents?: number;
          redeemPoints?: number;
        } = {};
        if (carrierCode) orderPatch.carrierCode = carrierCode;
        if (subtotalDiscountCents > 0 || couponId || redeemPointsForShop > 0 || freeShipping) {
          orderPatch.couponCode = couponCode ?? null;
          orderPatch.couponId = couponId ?? null;
          orderPatch.discountCents = subtotalDiscountCents;
          orderPatch.redeemPoints = redeemPointsForShop;
        }
        if (Object.keys(orderPatch).length > 0) {
          await tx.order.update({ where: { id: order.id }, data: orderPatch });
        }

        // Redeem coupon usage — let errors bubble up so the txn rolls back.
        // The unique (couponId, orderId) constraint also prevents double-redeem.
        if (couponId && (couponDiscountCents > 0 || freeShipping)) {
          const recordCents = freeShipping
            ? Math.max(0, shippingCents)
            : couponDiscountCents;
          await this.coupons.redeem(userId, couponId, order.id, recordCents);
        }

        for (const it of items) {
          await tx.product.update({
            where: { id: it.productId },
            data: { stock: { decrement: it.quantity } },
          });
        }

        createdOrders.push({
          id: order.id,
          customerId: order.customerId,
          shopId: order.shopId,
          status: order.status as Order['status'],
          items: order.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            productName: i.productName,
            unitPriceCents: i.unitPriceCents,
            quantity: i.quantity,
            subtotalCents: i.subtotalCents,
          })),
          subtotalCents: order.subtotalCents,
          shippingCents: order.shippingCents,
          discountCents: subtotalDiscountCents,
          totalCents: order.totalCents,
          shippingAddress: input.shippingAddress,
          carrierCode: carrierCode,
          couponCode: couponCode,
          createdAt: order.createdAt.toISOString(),
        });
      });
    }

    // (Phase 5 fix #3) NOW deduct loyalty points — only after all orders committed
    if (clampedRedeemPoints > 0) {
      try {
        await this.loyalty.redeem(userId, clampedRedeemPoints);
      } catch (e) {
        // Highly unlikely (we pre-checked), but log so it doesn't go silent.
        // eslint-disable-next-line no-console
        console.error('[checkout] loyalty redeem failed AFTER orders created:', e);
      }
    }

    // After orders exist, try to attribute via affiliate code (if provided)
    if (input.affiliateCode) {
      for (const o of createdOrders) {
        const productIds = o.items.map((i) => i.productId);
        try {
          await this.creators.attributeOrder(input.affiliateCode, {
            id: o.id,
            shopId: o.shopId,
            subtotalCents: o.subtotalCents,
            productIds,
          });
        } catch {
          // attribution failures don't block checkout
        }
      }
    }

    // Clear cart after all orders created
    await this.prisma.cartItem.deleteMany({ where: { cart: { userId } } });

    return createdOrders;
  }
}
