import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  LoyaltyAccount,
  LoyaltyEntry,
  LoyaltyEntryKind,
  LoyaltyTier,
} from '../../shared/types';

interface DbLoyaltyAccount {
  id: string;
  userId: string;
  points: number;
  lifetimePoints: number;
  tier: string;
  createdAt: string;
  updatedAt: string;
}

interface DbLoyaltyEntry {
  id: string;
  accountId: string;
  kind: string;
  points: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
}

const TIER_THRESHOLDS: Array<{ tier: LoyaltyTier; min: number }> = [
  { tier: 'PLATINUM', min: 50000 },
  { tier: 'GOLD', min: 10000 },
  { tier: 'SILVER', min: 2000 },
  { tier: 'BRONZE', min: 0 },
];

function tierFromLifetime(lifetime: number): LoyaltyTier {
  for (const t of TIER_THRESHOLDS) {
    if (lifetime >= t.min) return t.tier;
  }
  return 'BRONZE';
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function toAccount(d: DbLoyaltyAccount): LoyaltyAccount {
  return {
    id: d.id,
    userId: d.userId,
    points: d.points,
    lifetimePoints: d.lifetimePoints,
    tier: d.tier as LoyaltyTier,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toEntry(d: DbLoyaltyEntry): LoyaltyEntry {
  return {
    id: d.id,
    accountId: d.accountId,
    kind: d.kind as LoyaltyEntryKind,
    points: d.points,
    refType: d.refType,
    refId: d.refId,
    note: d.note,
    createdAt: d.createdAt,
  };
}

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string): Promise<LoyaltyAccount> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM loyalty_accounts WHERE userId = ?`,
      userId,
    )) as DbLoyaltyAccount[];
    if (rows.length > 0) return toAccount(rows[0]);

    const id = newId('loy');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO loyalty_accounts (id, userId, points, lifetimePoints, tier, createdAt, updatedAt)
       VALUES (?, ?, 0, 0, 'BRONZE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      userId,
    );
    const created = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM loyalty_accounts WHERE id = ?`,
      id,
    )) as DbLoyaltyAccount[];
    return toAccount(created[0]);
  }

  async getEntries(userId: string, limit = 50): Promise<LoyaltyEntry[]> {
    const account = await this.getOrCreate(userId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM loyalty_entries WHERE accountId = ?
       ORDER BY createdAt DESC LIMIT ?`,
      account.id,
      Math.min(limit, 200),
    )) as DbLoyaltyEntry[];
    return rows.map(toEntry);
  }

  /**
   * คำนวณแต้มที่ได้จาก order (1 แต้ม / 10 บาท)
   * คูณ multiplier ตาม tier:
   *   BRONZE: 1x, SILVER: 1.2x, GOLD: 1.5x, PLATINUM: 2x
   */
  private pointsForOrder(account: LoyaltyAccount, totalCents: number): number {
    const base = Math.floor(totalCents / 1000); // 10 บาท = 1 แต้ม
    const multBp: Record<LoyaltyTier, number> = {
      BRONZE: 100,
      SILVER: 120,
      GOLD: 150,
      PLATINUM: 200,
    };
    return Math.floor((base * multBp[account.tier]) / 100);
  }

  /**
   * Earn เมื่อ order ถูก PAID — idempotent ผ่าน refType+refId
   */
  async earnFromOrder(
    userId: string,
    orderId: string,
    totalCents: number,
  ): Promise<LoyaltyEntry | null> {
    const account = await this.getOrCreate(userId);

    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM loyalty_entries
       WHERE accountId = ? AND refType = 'ORDER' AND refId = ? AND kind = 'EARN'`,
      account.id,
      orderId,
    )) as Array<{ id: string }>;
    if (existing.length > 0) return null;

    const pts = this.pointsForOrder(account, totalCents);
    if (pts <= 0) return null;

    const entryId = newId('lye');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO loyalty_entries
        (id, accountId, kind, points, refType, refId, note, createdAt)
       VALUES (?, ?, 'EARN', ?, 'ORDER', ?, ?, CURRENT_TIMESTAMP)`,
      entryId,
      account.id,
      pts,
      orderId,
      `ได้แต้มจากออเดอร์`,
    );

    const newLifetime = account.lifetimePoints + pts;
    const newTier = tierFromLifetime(newLifetime);
    await this.prisma.$executeRawUnsafe(
      `UPDATE loyalty_accounts
       SET points = points + ?, lifetimePoints = ?, tier = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      pts,
      newLifetime,
      newTier,
      account.id,
    );

    const created = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM loyalty_entries WHERE id = ?`,
      entryId,
    )) as DbLoyaltyEntry[];
    return toEntry(created[0]);
  }

  /**
   * Reverse แต้มเมื่อ refund (เฉพาะ EARN ของ order นั้น)
   */
  async reverseFromOrder(userId: string, orderId: string): Promise<void> {
    const account = await this.getOrCreate(userId);
    const earn = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM loyalty_entries
       WHERE accountId = ? AND refType = 'ORDER' AND refId = ? AND kind = 'EARN'`,
      account.id,
      orderId,
    )) as DbLoyaltyEntry[];
    if (earn.length === 0) return;

    const reversedExisting = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM loyalty_entries
       WHERE accountId = ? AND refType = 'ORDER' AND refId = ? AND kind = 'REVERSE'`,
      account.id,
      orderId,
    )) as Array<{ id: string }>;
    if (reversedExisting.length > 0) return;

    const pts = earn[0].points;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO loyalty_entries
        (id, accountId, kind, points, refType, refId, note, createdAt)
       VALUES (?, ?, 'REVERSE', ?, 'ORDER', ?, ?, CURRENT_TIMESTAMP)`,
      newId('lye'),
      account.id,
      -pts,
      orderId,
      `คืนแต้มจากการขอคืนเงิน`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE loyalty_accounts
       SET points = points - ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      pts,
      account.id,
    );
  }

  /**
   * Manual redeem แต้มเป็นส่วนลด (1 แต้ม = 1 บาท หรือ 100 cents)
   */
  async redeem(userId: string, points: number): Promise<{ discountCents: number; account: LoyaltyAccount }> {
    if (points <= 0) throw new BadRequestException('แต้มต้องมากกว่า 0');
    const account = await this.getOrCreate(userId);
    if (account.points < points) {
      throw new BadRequestException('แต้มไม่พอ');
    }
    const discountCents = points * 100;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO loyalty_entries
        (id, accountId, kind, points, refType, refId, note, createdAt)
       VALUES (?, ?, 'REDEEM', ?, NULL, NULL, ?, CURRENT_TIMESTAMP)`,
      newId('lye'),
      account.id,
      -points,
      `แลกเป็นเครดิตส่วนลด`,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE loyalty_accounts
       SET points = points - ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      points,
      account.id,
    );

    const fresh = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM loyalty_accounts WHERE id = ?`,
      account.id,
    )) as DbLoyaltyAccount[];
    return { discountCents, account: toAccount(fresh[0]) };
  }

  /**
   * Manual adjust สำหรับ admin / referral reward
   */
  async adjust(
    userId: string,
    points: number,
    kind: LoyaltyEntryKind,
    refType: string | null,
    refId: string | null,
    note: string,
  ): Promise<void> {
    const account = await this.getOrCreate(userId);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO loyalty_entries
        (id, accountId, kind, points, refType, refId, note, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      newId('lye'),
      account.id,
      kind,
      points,
      refType,
      refId,
      note,
    );

    if (points !== 0) {
      const newLifetime =
        points > 0 ? account.lifetimePoints + points : account.lifetimePoints;
      const newTier = tierFromLifetime(newLifetime);
      await this.prisma.$executeRawUnsafe(
        `UPDATE loyalty_accounts
         SET points = points + ?,
             lifetimePoints = ?,
             tier = ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        points,
        newLifetime,
        newTier,
        account.id,
      );
    }
  }
}
