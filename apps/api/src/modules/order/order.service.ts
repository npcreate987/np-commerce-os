import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Address, Order, OrderStatus, ShipOrderInput, UserRole } from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LogisticsService } from '../logistics/logistics.service';
import { WalletService } from '../wallet/wallet.service';
import { CreatorService } from '../creator/creator.service';

interface DbOrder {
  id: string;
  customerId: string;
  shopId: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddressJson: string;
  carrierCode?: string | null;
  createdAt: Date;
  items: {
    id: string;
    productId: string;
    productName: string;
    unitPriceCents: number;
    quantity: number;
    subtotalCents: number;
  }[];
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logistics: LogisticsService,
    private readonly wallet: WalletService,
    private readonly creators: CreatorService,
  ) {}

  async listMyOrders(userId: string): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return Promise.all(orders.map((o) => this.toOrder(o as unknown as DbOrder)));
  }

  async listShopOrders(userId: string, shopId: string): Promise<Order[]> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    if (shop.ownerId !== userId) throw new ForbiddenException('Not your shop');

    const orders = await this.prisma.order.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return Promise.all(orders.map((o) => this.toOrder(o as unknown as DbOrder)));
  }

  async getOne(userId: string, role: UserRole, id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, shop: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const isOwner = order.customerId === userId;
    const isMerchant = order.shop.ownerId === userId;
    const isAdmin = role === 'ADMIN';
    if (!isOwner && !isMerchant && !isAdmin) {
      throw new ForbiddenException('Cannot view this order');
    }
    return this.toOrder(order as unknown as DbOrder);
  }

  /**
   * Merchant ships the order. Requires carrierCode + trackingNo.
   * Creates a Shipment row via LogisticsService.
   */
  async ship(userId: string, orderId: string, input: ShipOrderInput): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shop: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.shop.ownerId !== userId) throw new ForbiddenException('Not your shop');
    if (order.status !== 'PAID' && order.status !== 'READY_TO_SHIP') {
      throw new BadRequestException(`Order is not ready to ship (status=${order.status})`);
    }

    await this.logistics.createOrUpdateShipment(orderId, input);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'SHIPPED' },
      include: { items: true },
    });
    return this.toOrder(updated as unknown as DbOrder);
  }

  /**
   * Customer confirms received → COMPLETED + release escrow to merchant.
   */
  async confirmReceived(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shop: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
      throw new BadRequestException(`Order is not eligible to confirm (status=${order.status})`);
    }

    // (Phase 5 fix) Release escrow on the actual merchant share = subtotal - discount,
    // matching what was held at payment confirmation. Commission is computed against
    // the same net amount inside CreatorService.
    const merchantShareCents = await this.wallet.merchantShareForOrder(order.id);
    const commissionCents = await this.creators.releaseForOrder(order.id);
    // Safety: never release more commission than was actually escrowed
    const safeCommission = Math.min(commissionCents, merchantShareCents);
    if (safeCommission > 0) {
      await this.wallet.escrowReleaseWithCommission(
        order.shop.ownerId,
        merchantShareCents,
        safeCommission,
        order.id,
      );
    } else {
      await this.wallet.escrowRelease(order.shop.ownerId, merchantShareCents, order.id);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'COMPLETED' },
      include: { items: true },
    });
    return this.toOrder(updated as unknown as DbOrder);
  }

  /** Customer cancels a PENDING_PAYMENT order. */
  async cancel(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException('Only unpaid orders can be cancelled');
    }
    // Restore stock
    for (const it of order.items) {
      await this.prisma.product.update({
        where: { id: it.productId },
        data: { stock: { increment: it.quantity } },
      });
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
      include: { items: true },
    });
    return this.toOrder(updated as unknown as DbOrder);
  }

  private async toOrder(o: DbOrder): Promise<Order> {
    // Phase 20.1 — `carrierCode` / `couponCode` / `discountCents` used to be
    // additive columns invisible to Prisma, so this helper used to fetch
    // them via a follow-up `$queryRawUnsafe`. Since the Postgres migration
    // they're all proper Order fields, but the SQLite `?` placeholder
    // never got cleaned up and was 500-ing every `GET /orders/:id`. The
    // cheapest fix is to drop the extra query entirely — the value is
    // already on `o`. (The `as unknown as DbOrder` cast a few lines up
    // narrows away these fields; we re-expose them through the wider
    // shape.)
    const wide = o as DbOrder & {
      carrierCode: string | null;
      couponCode: string | null;
      discountCents: number | null;
    };
    const carrierCode: string | null = wide.carrierCode ?? null;
    const couponCode: string | null = wide.couponCode ?? null;
    const discountCents: number = wide.discountCents ?? 0;

    return {
      id: o.id,
      customerId: o.customerId,
      shopId: o.shopId,
      status: o.status as OrderStatus,
      items: o.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        subtotalCents: i.subtotalCents,
      })),
      subtotalCents: o.subtotalCents,
      shippingCents: o.shippingCents,
      discountCents,
      totalCents: o.totalCents,
      shippingAddress: JSON.parse(o.shippingAddressJson) as Address,
      carrierCode,
      couponCode,
      createdAt: o.createdAt.toISOString(),
    };
  }
}
