import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Wallet, WalletEntry, WalletEntryKind } from '../../shared/types';

interface DbWallet {
  id: string;
  userId: string;
  availableCents: number;
  pendingCents: number;
  createdAt: string;
}

interface DbWalletEntry {
  id: string;
  walletId: string;
  kind: string;
  amountCents: number;
  orderId: string | null;
  description: string | null;
  createdAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ensure a wallet row exists for the user, then return it. */
  async getOrCreate(userId: string): Promise<Wallet> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, availableCents, pendingCents, createdAt FROM wallets WHERE userId = ?`,
      userId,
    )) as DbWallet[];

    const first = rows[0];
    if (!first) {
      const id = newId('wal');
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO wallets (id, userId, availableCents, pendingCents) VALUES (?, ?, 0, 0)`,
        id,
        userId,
      );
      return {
        id,
        userId,
        availableCents: 0,
        pendingCents: 0,
        createdAt: new Date().toISOString(),
      };
    }
    return this.toWallet(first);
  }

  async myWallet(userId: string): Promise<Wallet> {
    return this.getOrCreate(userId);
  }

  async myEntries(userId: string, limit = 50): Promise<WalletEntry[]> {
    const wallet = await this.getOrCreate(userId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, walletId, kind, amountCents, orderId, description, createdAt
         FROM wallet_entries WHERE walletId = ?
         ORDER BY createdAt DESC LIMIT ?`,
      wallet.id,
      Math.min(limit, 200),
    )) as DbWalletEntry[];
    return rows.map((r) => this.toEntry(r));
  }

  /** Credit pending balance for a merchant when a customer pays. */
  async escrowHold(merchantUserId: string, amountCents: number, orderId: string): Promise<void> {
    const wallet = await this.getOrCreate(merchantUserId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE wallets SET pendingCents = pendingCents + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      amountCents,
      wallet.id,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO wallet_entries (id, walletId, kind, amountCents, orderId, description)
       VALUES (?, ?, 'ESCROW_HOLD', ?, ?, ?)`,
      newId('we'),
      wallet.id,
      amountCents,
      orderId,
      'พักเงิน escrow รอจัดส่งและยืนยันรับสินค้า',
    );
  }

  /** Move pending → available (release escrow). */
  async escrowRelease(
    merchantUserId: string,
    amountCents: number,
    orderId: string,
  ): Promise<void> {
    const wallet = await this.getOrCreate(merchantUserId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE wallets SET pendingCents = pendingCents - ?, availableCents = availableCents + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      amountCents,
      amountCents,
      wallet.id,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO wallet_entries (id, walletId, kind, amountCents, orderId, description)
       VALUES (?, ?, 'ESCROW_RELEASE', ?, ?, ?)`,
      newId('we'),
      wallet.id,
      amountCents,
      orderId,
      'ปล่อยเงินจาก escrow เมื่อปิดออเดอร์สำเร็จ',
    );
  }

  /**
   * Release escrow with a creator commission split:
   * - merchant.pending  -= subtotal
   * - merchant.available += (subtotal - commission)
   * - records ESCROW_RELEASE entry for the net + COMMISSION_PAY entry for the deduction
   *
   * Commission credit to the creator is handled by CreatorService.releaseForOrder.
   */
  async escrowReleaseWithCommission(
    merchantUserId: string,
    subtotalCents: number,
    commissionCents: number,
    orderId: string,
  ): Promise<void> {
    const wallet = await this.getOrCreate(merchantUserId);
    const net = subtotalCents - commissionCents;
    await this.prisma.$executeRawUnsafe(
      `UPDATE wallets
         SET pendingCents = pendingCents - ?,
             availableCents = availableCents + ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      subtotalCents,
      net,
      wallet.id,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO wallet_entries (id, walletId, kind, amountCents, orderId, description)
       VALUES (?, ?, 'ESCROW_RELEASE', ?, ?, ?)`,
      newId('we'),
      wallet.id,
      net,
      orderId,
      'ปล่อยเงินจาก escrow (หักคอมมิชชั่น Creator แล้ว)',
    );
    if (commissionCents > 0) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO wallet_entries (id, walletId, kind, amountCents, orderId, description)
         VALUES (?, ?, 'COMMISSION_PAY', ?, ?, ?)`,
        newId('we'),
        wallet.id,
        -commissionCents,
        orderId,
        'จ่ายคอมมิชชั่นให้ Creator',
      );
    }
  }

  /** Refund: subtract from pending (no credit to available). */
  async escrowRefund(
    merchantUserId: string,
    amountCents: number,
    orderId: string,
  ): Promise<void> {
    const wallet = await this.getOrCreate(merchantUserId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE wallets SET pendingCents = pendingCents - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      amountCents,
      wallet.id,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO wallet_entries (id, walletId, kind, amountCents, orderId, description)
       VALUES (?, ?, 'ESCROW_REFUND', ?, ?, ?)`,
      newId('we'),
      wallet.id,
      -amountCents,
      orderId,
      'คืนเงินให้ลูกค้าจาก escrow',
    );
  }

  /**
   * Phase 5 helper: คำนวณยอดที่ merchant จะได้จริงจาก order
   * = subtotalCents - discountCents (ค่าส่งเป็นของ carrier ไม่นับใน escrow)
   *
   * ใช้ raw SQL เพราะ Prisma client ไม่รู้จัก discountCents column (เพิ่มผ่าน bootstrap-phase5)
   */
  async merchantShareForOrder(orderId: string): Promise<number> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT subtotalCents, COALESCE(discountCents, 0) AS discountCents
         FROM orders WHERE id = ?`,
      orderId,
    )) as Array<{ subtotalCents: number; discountCents: number }>;
    const r = rows[0];
    if (!r) return 0;
    const net = Number(r.subtotalCents) - Number(r.discountCents);
    return Math.max(0, net);
  }

  /** Verify the user is the merchant owner of the order's shop. */
  async assertMerchantOf(userId: string, orderId: string): Promise<string> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT shops.ownerId AS ownerId FROM orders INNER JOIN shops ON orders.shopId = shops.id WHERE orders.id = ?`,
      orderId,
    )) as Array<{ ownerId: string }>;
    const first = rows[0];
    if (!first) throw new NotFoundException('Order not found');
    if (first.ownerId !== userId) {
      throw new ForbiddenException('Not your order');
    }
    return first.ownerId;
  }

  private toWallet(r: DbWallet): Wallet {
    return {
      id: r.id,
      userId: r.userId,
      availableCents: Number(r.availableCents),
      pendingCents: Number(r.pendingCents),
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }

  private toEntry(r: DbWalletEntry): WalletEntry {
    return {
      id: r.id,
      walletId: r.walletId,
      kind: r.kind as WalletEntryKind,
      amountCents: Number(r.amountCents),
      orderId: r.orderId,
      description: r.description,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }
}
