import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateDisputeInput,
  Dispute,
  DisputeAuthorRole,
  DisputeMessage,
  DisputeReason,
  DisputeStatus,
  ReplyDisputeInput,
  ResolveDisputeInput,
  UserRole,
} from '../../shared/types';
import { WalletService } from '../wallet/wallet.service';
import { CreatorService } from '../creator/creator.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

interface DbDispute {
  id: string;
  orderId: string;
  status: string;
  reason: string;
  description: string;
  evidenceJson: string;
  createdAt: string;
  updatedAt: string;
}

interface DbDisputeMessage {
  id: string;
  disputeId: string;
  authorId: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable()
export class DisputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly creators: CreatorService,
    private readonly loyalty: LoyaltyService,
  ) {}

  /** Customer opens a dispute on an order they own. */
  async open(
    userId: string,
    orderId: string,
    input: CreateDisputeInput,
  ): Promise<Dispute> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shop: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) throw new ForbiddenException('Not your order');

    const allowed = ['PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
    if (!allowed.includes(order.status)) {
      throw new BadRequestException(`Cannot open dispute when status is ${order.status}`);
    }

    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM disputes WHERE orderId = ?`,
      orderId,
    )) as Array<{ id: string }>;
    if (existing.length > 0) {
      throw new BadRequestException('Dispute already exists for this order');
    }

    const id = newId('dis');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO disputes (id, orderId, status, reason, description, evidenceJson)
       VALUES (?, ?, 'OPEN', ?, ?, ?)`,
      id,
      orderId,
      input.reason,
      input.description,
      JSON.stringify(input.evidence ?? []),
    );

    // Initial customer message
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO dispute_messages (id, disputeId, authorId, authorRole, body) VALUES (?, ?, ?, 'CUSTOMER', ?)`,
      newId('dm'),
      id,
      userId,
      input.description,
    );

    return this.getOne(userId, 'CUSTOMER', id);
  }

  /** Customer or merchant adds a message. */
  async reply(
    userId: string,
    role: UserRole,
    disputeId: string,
    input: ReplyDisputeInput,
  ): Promise<DisputeMessage> {
    const d = await this.findDisputeForUser(userId, role, disputeId);

    let authorRole: DisputeAuthorRole;
    if (role === 'ADMIN') authorRole = 'ADMIN';
    else if (d.kind === 'customer') authorRole = 'CUSTOMER';
    else authorRole = 'MERCHANT';

    const id = newId('dm');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO dispute_messages (id, disputeId, authorId, authorRole, body) VALUES (?, ?, ?, ?, ?)`,
      id,
      disputeId,
      userId,
      authorRole,
      input.body,
    );

    // Move OPEN -> MERCHANT_REPLIED when merchant replies first time
    if (authorRole === 'MERCHANT' && d.dispute.status === 'OPEN') {
      await this.prisma.$executeRawUnsafe(
        `UPDATE disputes SET status = 'MERCHANT_REPLIED', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        disputeId,
      );
    }

    return {
      id,
      disputeId,
      authorId: userId,
      authorRole,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
  }

  /** Admin (or auto) decides the resolution: REFUND → customer, RELEASE → merchant. */
  async resolve(
    userId: string,
    role: UserRole,
    disputeId: string,
    input: ResolveDisputeInput,
  ): Promise<Dispute> {
    if (role !== 'ADMIN' && role !== 'MERCHANT' && role !== 'CUSTOMER') {
      throw new ForbiddenException('Cannot resolve');
    }
    // For MVP: anyone-involved may select a self-resolution.
    // - Customer chooses RELEASE = "I'm happy, release to merchant"
    // - Merchant chooses REFUND  = "Customer was right, refund"
    // - ADMIN may force either

    const d = await this.findDisputeForUser(userId, role, disputeId);

    if (role === 'CUSTOMER' && input.resolution !== 'RELEASE') {
      throw new ForbiddenException(
        'Customer may only choose RELEASE (use OTHER side path for refund)',
      );
    }
    if (role === 'MERCHANT' && input.resolution !== 'REFUND') {
      throw new ForbiddenException(
        'Merchant may only choose REFUND (release happens via auto-complete)',
      );
    }

    const finalStatus: DisputeStatus =
      input.resolution === 'REFUND' ? 'RESOLVED_REFUND' : 'RESOLVED_RELEASE';

    // Fetch order for amount + merchant
    const orderRows = (await this.prisma.$queryRawUnsafe(
      `SELECT orders.id, orders.totalCents, orders.shippingCents,
              orders.subtotalCents,
              shops.ownerId AS merchantId
        FROM orders INNER JOIN shops ON orders.shopId = shops.id
        WHERE orders.id = ?`,
      d.dispute.orderId,
    )) as Array<{
      id: string;
      totalCents: number;
      shippingCents: number;
      subtotalCents: number;
      merchantId: string;
    }>;

    const o = orderRows[0];
    if (!o) throw new NotFoundException('Order not found');

    // (Phase 5 fix) Use net merchant share = subtotal - discount, matching escrow hold
    const merchantShareCents = await this.wallet.merchantShareForOrder(o.id);

    if (input.resolution === 'REFUND') {
      await this.wallet.escrowRefund(o.merchantId, merchantShareCents, o.id);
      await this.creators.reverseForOrder(o.id);
      // Reverse loyalty points earned on this order (idempotent)
      try {
        await this.loyalty.reverseFromOrder(d.dispute.customerId, o.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[dispute] loyalty reverse skipped:', (e as Error).message);
      }
      await this.prisma.$executeRawUnsafe(
        `UPDATE orders SET status = 'REFUNDED', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        o.id,
      );
    } else {
      const commissionCents = await this.creators.releaseForOrder(o.id);
      const safeCommission = Math.min(commissionCents, merchantShareCents);
      if (safeCommission > 0) {
        await this.wallet.escrowReleaseWithCommission(
          o.merchantId,
          merchantShareCents,
          safeCommission,
          o.id,
        );
      } else {
        await this.wallet.escrowRelease(o.merchantId, merchantShareCents, o.id);
      }
      await this.prisma.$executeRawUnsafe(
        `UPDATE orders SET status = 'COMPLETED', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        o.id,
      );
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE disputes SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      finalStatus,
      disputeId,
    );

    // System message
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO dispute_messages (id, disputeId, authorId, authorRole, body) VALUES (?, ?, ?, 'ADMIN', ?)`,
      newId('dm'),
      disputeId,
      userId,
      input.resolution === 'REFUND'
        ? 'ผลการพิจารณา: คืนเงินให้ลูกค้า — ปิดเคส'
        : 'ผลการพิจารณา: ปล่อยเงินให้ร้านค้า — ปิดเคส',
    );

    return this.getOne(userId, role, disputeId);
  }

  async listMine(userId: string): Promise<Dispute[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT d.id, d.orderId, d.status, d.reason, d.description, d.evidenceJson, d.createdAt, d.updatedAt
         FROM disputes d
         INNER JOIN orders o ON o.id = d.orderId
         WHERE o.customerId = ?
         ORDER BY d.createdAt DESC`,
      userId,
    )) as DbDispute[];
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  async listForShop(userId: string, shopId: string): Promise<Dispute[]> {
    const shopRows = (await this.prisma.$queryRawUnsafe(
      `SELECT ownerId FROM shops WHERE id = ?`,
      shopId,
    )) as Array<{ ownerId: string }>;
    const shopRow = shopRows[0];
    if (!shopRow) throw new NotFoundException('Shop not found');
    if (shopRow.ownerId !== userId) throw new ForbiddenException('Not your shop');

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT d.id, d.orderId, d.status, d.reason, d.description, d.evidenceJson, d.createdAt, d.updatedAt
         FROM disputes d
         INNER JOIN orders o ON o.id = d.orderId
         WHERE o.shopId = ?
         ORDER BY d.createdAt DESC`,
      shopId,
    )) as DbDispute[];
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  async getOne(userId: string, role: UserRole, disputeId: string): Promise<Dispute> {
    const d = await this.findDisputeForUser(userId, role, disputeId);
    return this.hydrate(d.dispute);
  }

  // ---------- private helpers ----------

  private async hydrate(d: DbDispute): Promise<Dispute> {
    const msgs = (await this.prisma.$queryRawUnsafe(
      `SELECT id, disputeId, authorId, authorRole, body, createdAt
         FROM dispute_messages WHERE disputeId = ? ORDER BY createdAt ASC`,
      d.id,
    )) as DbDisputeMessage[];

    return {
      id: d.id,
      orderId: d.orderId,
      status: d.status as DisputeStatus,
      reason: d.reason as DisputeReason,
      description: d.description,
      evidence: JSON.parse(d.evidenceJson || '[]') as string[],
      messages: msgs.map((m) => ({
        id: m.id,
        disputeId: m.disputeId,
        authorId: m.authorId,
        authorRole: m.authorRole as DisputeAuthorRole,
        body: m.body,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
      createdAt: new Date(d.createdAt).toISOString(),
      updatedAt: new Date(d.updatedAt).toISOString(),
    };
  }

  private async findDisputeForUser(
    userId: string,
    role: UserRole,
    disputeId: string,
  ): Promise<{
    dispute: DbDispute & { customerId: string; merchantId: string };
    kind: 'customer' | 'merchant' | 'admin';
  }> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT d.id, d.orderId, d.status, d.reason, d.description, d.evidenceJson, d.createdAt, d.updatedAt,
              o.customerId AS customerId, s.ownerId AS merchantId
         FROM disputes d
         INNER JOIN orders o ON o.id = d.orderId
         INNER JOIN shops s ON s.id = o.shopId
         WHERE d.id = ?`,
      disputeId,
    )) as Array<DbDispute & { customerId: string; merchantId: string }>;
    const r = rows[0];
    if (!r) throw new NotFoundException('Dispute not found');

    if (role === 'ADMIN') return { dispute: r, kind: 'admin' };
    if (r.customerId === userId) return { dispute: r, kind: 'customer' };
    if (r.merchantId === userId) return { dispute: r, kind: 'merchant' };
    throw new ForbiddenException('Cannot view this dispute');
  }
}
