import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { Referral, ReferralClaim } from '../../shared/types';

interface DbReferral {
  id: string;
  inviterId: string;
  code: string;
  rewardPoints: number;
  inviteeRewardPoints: number;
  uses: number;
  createdAt: string;
}

interface DbClaim {
  id: string;
  referralId: string;
  inviteeId: string;
  status: string;
  rewardedAt: string | null;
  createdAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'NP';
  for (let i = 0; i < 6; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

function toReferral(d: DbReferral): Referral {
  return {
    id: d.id,
    inviterId: d.inviterId,
    code: d.code,
    rewardPoints: d.rewardPoints,
    inviteeRewardPoints: d.inviteeRewardPoints,
    uses: d.uses,
    createdAt: d.createdAt,
  };
}

function toClaim(d: DbClaim): ReferralClaim {
  return {
    id: d.id,
    referralId: d.referralId,
    inviteeId: d.inviteeId,
    status: d.status as ReferralClaim['status'],
    rewardedAt: d.rewardedAt,
    createdAt: d.createdAt,
  };
}

@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async getOrCreate(userId: string): Promise<Referral> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM referrals WHERE inviterId = ?`,
      userId,
    )) as DbReferral[];
    if (rows.length > 0) return toReferral(rows[0]);

    let code = makeCode();
    for (let i = 0; i < 5; i++) {
      const dup = (await this.prisma.$queryRawUnsafe(
        `SELECT id FROM referrals WHERE code = ?`,
        code,
      )) as Array<{ id: string }>;
      if (dup.length === 0) break;
      code = makeCode();
    }
    const id = newId('ref');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO referrals
        (id, inviterId, code, rewardPoints, inviteeRewardPoints, uses, createdAt)
       VALUES (?, ?, ?, 50, 50, 0, CURRENT_TIMESTAMP)`,
      id,
      userId,
      code,
    );
    const created = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM referrals WHERE id = ?`,
      id,
    )) as DbReferral[];
    return toReferral(created[0]);
  }

  async myClaims(userId: string): Promise<ReferralClaim[]> {
    const ref = await this.getOrCreate(userId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM referral_claims WHERE referralId = ? ORDER BY createdAt DESC`,
      ref.id,
    )) as DbClaim[];
    return rows.map(toClaim);
  }

  /**
   * Claim referral code — เรียกจาก customer ที่เป็น invitee
   * (signup ใหม่ หรือยังไม่เคย claim มาก่อน)
   */
  async claim(inviteeUserId: string, code: string): Promise<ReferralClaim> {
    const cleanCode = code.toUpperCase();
    const refRows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM referrals WHERE code = ?`,
      cleanCode,
    )) as DbReferral[];
    if (refRows.length === 0) {
      throw new NotFoundException('รหัสเชิญไม่ถูกต้อง');
    }
    const ref = refRows[0];
    if (ref.inviterId === inviteeUserId) {
      throw new BadRequestException('ใช้รหัสของตัวเองไม่ได้');
    }

    const alreadyClaimedAny = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM referral_claims WHERE inviteeId = ?`,
      inviteeUserId,
    )) as Array<{ id: string }>;
    if (alreadyClaimedAny.length > 0) {
      throw new BadRequestException('คุณเคยใช้รหัสเชิญแล้ว');
    }

    const id = newId('rfc');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO referral_claims
        (id, referralId, inviteeId, status, rewardedAt, createdAt)
       VALUES (?, ?, ?, 'REWARDED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      ref.id,
      inviteeUserId,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE referrals SET uses = uses + 1 WHERE id = ?`,
      ref.id,
    );

    // มอบแต้มทันที (ทั้ง inviter และ invitee)
    await this.loyalty.adjust(
      ref.inviterId,
      ref.rewardPoints,
      'EARN',
      'REFERRAL',
      id,
      `ชวนเพื่อนสำเร็จ (+${ref.rewardPoints} แต้ม)`,
    );
    await this.loyalty.adjust(
      inviteeUserId,
      ref.inviteeRewardPoints,
      'EARN',
      'REFERRAL',
      id,
      `ใช้รหัสเชิญ (+${ref.inviteeRewardPoints} แต้ม)`,
    );

    const created = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM referral_claims WHERE id = ?`,
      id,
    )) as DbClaim[];
    return toClaim(created[0]);
  }
}
