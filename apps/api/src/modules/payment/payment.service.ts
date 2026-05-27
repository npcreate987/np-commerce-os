import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Address,
  CreatePaymentInput,
  Payment,
  PaymentMethod,
  PaymentStatus,
} from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { LocalService } from '../local/local.service';
import { RiderService } from '../rider/rider.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { MockPaymentAdapter } from './adapters/mock.adapter';
import { OmisePaymentAdapter } from './adapters/omise.adapter';
import type { PaymentAdapter, WebhookEvent } from './adapters/types';
import { randomBytes } from 'node:crypto';

/**
 * Phase 13.4 — PaymentService now multiplexes through pluggable adapters.
 *
 *   • `createForOrder` picks an adapter based on `PAYMENT_PROVIDER` env
 *     (omise / mock / auto). `auto` chooses omise when its key is set,
 *     falls back to mock so dev/CI never break.
 *   • `confirmMock` keeps the legacy dev-only direct-settle path. Production
 *     traffic settles via `handleWebhookEvent(...)` driven by
 *     `POST /v1/payments/webhook/:provider`.
 *   • `settle(...)` is the single funnel that mutates the order → PAID,
 *     escrows the wallet share, dispatches local rider, and credits loyalty.
 *     Both confirmMock and the webhook path call into it.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly adapters: Record<string, PaymentAdapter>;
  /** Resolved primary adapter for *new* charges. */
  private readonly activeAdapter: PaymentAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly local: LocalService,
    private readonly riders: RiderService,
    private readonly loyalty: LoyaltyService,
  ) {
    const mock = new MockPaymentAdapter();
    const omise = new OmisePaymentAdapter();
    this.adapters = { mock, omise };

    const requested = (process.env.PAYMENT_PROVIDER ?? 'auto').toLowerCase();
    if (requested === 'omise') {
      if (!omise.isReady()) {
        this.logger.warn('PAYMENT_PROVIDER=omise but OMISE_SECRET_KEY missing — falling back to mock');
        this.activeAdapter = mock;
      } else {
        this.activeAdapter = omise;
      }
    } else if (requested === 'mock') {
      this.activeAdapter = mock;
    } else {
      // auto
      this.activeAdapter = omise.isReady() ? omise : mock;
    }
    this.logger.log(`payment adapter = ${this.activeAdapter.id}`);
  }

  /** Used by `/v1/payments/config` so the FE knows which UI to show. */
  getConfig(): { provider: string; ready: boolean; methods: PaymentMethod[] } {
    return {
      provider: this.activeAdapter.id,
      ready: this.activeAdapter.isReady(),
      methods:
        this.activeAdapter.id === 'omise'
          ? (['PROMPTPAY'] as PaymentMethod[]) // expand when card flow lands
          : (['PROMPTPAY', 'COD'] as PaymentMethod[]),
    };
  }

  async createForOrder(userId: string, input: CreatePaymentInput): Promise<Payment> {
    const order = await this.prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException('Order is not awaiting payment');
    }

    // Delegate QR/charge creation to the active adapter. Adapter throws 4xx
    // on bad inputs (unsupported method, missing keys) — those propagate
    // straight to the client.
    const customer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const charge = await this.activeAdapter.createCharge({
      orderId: order.id,
      method: input.method,
      amountCents: order.totalCents,
      customerEmail: customer?.email,
    });

    const payment = await this.prisma.payment.upsert({
      where: { orderId: order.id },
      update: {
        method: input.method,
        amountCents: order.totalCents,
        status: 'PENDING',
        qrCodePayload: charge.qrCodePayload,
        provider: charge.provider,
        providerRef: charge.providerRef,
      },
      create: {
        orderId: order.id,
        method: input.method,
        amountCents: order.totalCents,
        status: 'PENDING',
        qrCodePayload: charge.qrCodePayload,
        provider: charge.provider,
        providerRef: charge.providerRef,
      },
    });

    return this.toPayment(payment);
  }

  /** Look up adapter by id — used by the webhook endpoint. */
  getAdapter(id: string): PaymentAdapter | null {
    return this.adapters[id] ?? null;
  }

  /**
   * Process a verified webhook event.
   * Idempotent: stores the event id in `payment_webhook_events`. If we've seen
   * this `(provider, eventId)` before, we no-op so retries don't double-credit.
   *
   * Phase 19.5 — ported from raw SQL ($queryRawUnsafe with SQLite `?` + `datetime('now')`)
   * to the Prisma client so this works on Postgres (Railway prod).
   */
  async handleWebhookEvent(event: WebhookEvent): Promise<{ deduped: boolean; settled: boolean }> {
    const existing = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: { provider: event.provider, providerEventId: event.eventId },
      },
      select: { id: true, settledAt: true },
    });
    if (existing) {
      // We've already accepted this event id. If it had also settled the order
      // last time → fully deduped + settled; if not, return deduped + the same
      // settlement state. Either way, do NOT insert again or run side effects.
      return { deduped: true, settled: !!existing.settledAt };
    }

    await this.prisma.paymentWebhookEvent.create({
      data: {
        id: `pwh_${randomBytes(6).toString('hex')}`,
        provider: event.provider,
        providerEventId: event.eventId,
        providerRef: event.providerRef,
        status: event.status,
        amountCents: event.amountCents,
      },
    });

    // Look up the payments row via providerRef. Falls back to providerRef-less
    // mock flow (where the test client may pass orderId in providerRef).
    let target = await this.prisma.payment.findFirst({
      where: { providerRef: event.providerRef },
      select: { id: true, orderId: true, status: true },
    });
    if (!target) {
      // Backward-compat with mock confirm where providerRef == orderId
      target = await this.prisma.payment.findFirst({
        where: { orderId: event.providerRef },
        select: { id: true, orderId: true, status: true },
      });
    }

    if (!target) {
      this.logger.warn(
        `webhook ${event.provider}/${event.eventId} ignored — no payment row for ref ${event.providerRef}`,
      );
      return { deduped: false, settled: false };
    }

    if (event.status === 'SUCCEEDED' && target.status !== 'SUCCEEDED') {
      await this.settle(target.orderId);
      await this.prisma.paymentWebhookEvent.update({
        where: {
          provider_providerEventId: { provider: event.provider, providerEventId: event.eventId },
        },
        data: { settledAt: new Date() },
      });
      return { deduped: false, settled: true };
    }
    if (event.status === 'FAILED' && target.status === 'PENDING') {
      await this.prisma.payment.update({
        where: { id: target.id },
        data: { status: 'FAILED', failureMessage: event.failureMessage ?? null },
      });
    }
    return { deduped: false, settled: false };
  }

  /**
   * Phase 20.1 — polling helper for the FE PromptPay sheet.
   *
   * Returns the latest payment row for an order so the customer's browser
   * can see status transition PENDING → SUCCEEDED in (near) real time.
   * Authorisation: caller must own the order. Anyone else gets 403 to
   * avoid leaking that an order exists (we 404 before 403 only when the
   * order genuinely doesn't exist — so an attacker can't probe IDs).
   */
  async getByOrder(userId: string, orderId: string): Promise<Payment> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not your order');
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Payment not found');
    return this.toPayment(payment);
  }

  /**
   * Dev-only direct settlement entry point. Kept for compatibility with the
   * existing `POST /v1/payments/mock/confirm/:orderId` route used by E2E tests
   * and the FE checkout-success simulator.
   */
  async confirmMock(userId: string, orderId: string): Promise<Payment> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not your order');

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status !== 'SUCCEEDED') {
      await this.settle(orderId);
    }
    const refreshed = await this.prisma.payment.findUnique({ where: { orderId } });
    return this.toPayment(refreshed!);
  }

  /**
   * Single funnel that flips payment → SUCCEEDED, order → PAID, runs all the
   * downstream side-effects (wallet escrow, local rider dispatch, loyalty).
   * Safe to call multiple times — short-circuits when already SUCCEEDED.
   */
  private async settle(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shop: true },
    });
    if (!order) {
      this.logger.warn(`settle skipped — order ${orderId} not found`);
      return;
    }
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
      this.logger.warn(`settle skipped — payment for ${orderId} not found`);
      return;
    }
    if (payment.status === 'SUCCEEDED') return;

    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { orderId }, data: { status: 'SUCCEEDED' } }),
      this.prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } }),
    ]);

    // Credit merchant wallet — net merchant share = subtotal - discount.
    // Coupon/loyalty discounts come off the merchant share; shipping goes to
    // the carrier and is excluded from escrow.
    const merchantShareCents = await this.wallet.merchantShareForOrder(order.id);
    await this.wallet.escrowHold(order.shop.ownerId, merchantShareCents, order.id);

    // Phase 4 — Auto-dispatch a DeliveryJob if order uses an EXPRESS_LOCAL
    // carrier and the merchant has a local store profile.
    try {
      await this.maybeDispatchLocalDelivery(order.id);
    } catch (e) {
      this.logger.warn(`local dispatch skipped: ${(e as Error).message}`);
    }

    // Phase 5 — Earn loyalty points based on NET merchandise spent
    // (subtotal - discount). Don't earn on shipping.
    try {
      const netForLoyalty = await this.wallet.merchantShareForOrder(order.id);
      await this.loyalty.earnFromOrder(order.customerId, order.id, netForLoyalty);
    } catch (e) {
      this.logger.warn(`loyalty earn skipped: ${(e as Error).message}`);
    }
  }

  private async maybeDispatchLocalDelivery(orderId: string): Promise<void> {
    // Read carrierCode + shopId + address via raw to avoid Prisma schema staleness
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT o.id, o.shopId, o.carrierCode, o.shippingAddressJson,
              c.kind AS carrierKind
         FROM orders o
         LEFT JOIN carriers c ON c.code = o.carrierCode
         WHERE o.id = ?`,
      orderId,
    )) as Array<{
      id: string;
      shopId: string;
      carrierCode: string | null;
      shippingAddressJson: string;
      carrierKind: string | null;
    }>;
    const row = rows[0];
    if (!row) return;
    if (!row.carrierCode || row.carrierKind !== 'EXPRESS_LOCAL') return;

    const store = await this.local.getStoreByShop(row.shopId);
    if (!store || !store.deliveryEnabled) return;

    let addr: Address;
    try {
      addr = JSON.parse(row.shippingAddressJson) as Address;
    } catch {
      return;
    }
    if (addr.lat == null || addr.lng == null) return;

    const dropText = [addr.line1, addr.subDistrict, addr.district, addr.province, addr.postalCode]
      .filter(Boolean)
      .join(' ');

    await this.riders.createJobForOrder({
      orderId: row.id,
      pickupLat: store.lat,
      pickupLng: store.lng,
      pickupText: store.addressText,
      dropLat: addr.lat,
      dropLng: addr.lng,
      dropText,
      baseDeliveryCents: store.baseDeliveryCents,
      perKmCents: store.perKmCents,
    });
  }

  private toPayment(p: {
    id: string;
    orderId: string;
    method: string;
    status: string;
    amountCents: number;
    qrCodePayload: string | null;
    createdAt: Date;
  }): Payment {
    return {
      id: p.id,
      orderId: p.orderId,
      method: p.method as PaymentMethod,
      status: p.status as PaymentStatus,
      amountCents: p.amountCents,
      qrCodePayload: p.qrCodePayload,
      createdAt: p.createdAt.toISOString(),
    };
  }
}
