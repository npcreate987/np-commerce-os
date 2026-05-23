import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AffiliateAttribution,
  ApplyCreatorInput,
  AttributionStatus,
  CreateLinkInput,
  CreatorLink,
  CreatorProfile,
  CreatorStats,
  CreatorStatus,
  LinkResolve,
  SocialAccount,
} from '../../shared/types';
import { WalletService } from '../wallet/wallet.service';

interface DbProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  socialJson: string;
  status: string;
  defaultCommissionBps: number;
  totalSalesCents: number;
  totalCommissionCents: number;
  createdAt: string;
}

interface DbLink {
  id: string;
  creatorId: string;
  code: string;
  productId: string | null;
  shopId: string | null;
  label: string | null;
  commissionBps: number | null;
  clickCount: number;
  conversionCount: number;
  active: number;
  createdAt: string;
}

interface DbAttribution {
  id: string;
  orderId: string;
  linkId: string;
  linkCode: string;
  creatorId: string;
  shopId: string;
  productId: string | null;
  commissionBps: number;
  commissionCents: number;
  status: string;
  createdAt: string;
  releasedAt: string | null;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function newShortCode(): string {
  // 6-char base36 short code (lowercase + digits) — easy to type
  return Math.random().toString(36).slice(2, 8);
}

@Injectable()
export class CreatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  // -----------------------------------------------------------------------
  // Profile
  // -----------------------------------------------------------------------

  async apply(userId: string, input: ApplyCreatorInput): Promise<CreatorProfile> {
    const existing = await this.findByUser(userId);
    if (existing) {
      throw new BadRequestException('คุณสมัคร Creator แล้ว');
    }
    const id = newId('crt');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO creator_profiles (id, userId, displayName, bio, avatarUrl, socialJson, status, defaultCommissionBps)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 500)`,
      id,
      userId,
      input.displayName,
      input.bio ?? null,
      input.avatarUrl ?? null,
      JSON.stringify(input.social ?? []),
    );
    const created = await this.findByUser(userId);
    if (!created) throw new Error('Creator profile insert failed');
    // Ensure wallet exists for commission payouts
    await this.wallet.getOrCreate(userId);
    return created;
  }

  async me(userId: string): Promise<CreatorProfile | null> {
    return this.findByUser(userId);
  }

  async ensureMe(userId: string): Promise<CreatorProfile> {
    const p = await this.findByUser(userId);
    if (!p) throw new NotFoundException('ยังไม่ได้สมัคร Creator');
    return p;
  }

  async listActive(limit = 30): Promise<CreatorProfile[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, displayName, bio, avatarUrl, socialJson, status,
              defaultCommissionBps, totalSalesCents, totalCommissionCents, createdAt
         FROM creator_profiles
         WHERE status = 'ACTIVE'
         ORDER BY totalSalesCents DESC, createdAt DESC
         LIMIT ?`,
      Math.min(limit, 100),
    )) as DbProfile[];
    return rows.map((r) => this.toProfile(r));
  }

  // -----------------------------------------------------------------------
  // Links
  // -----------------------------------------------------------------------

  async createLink(userId: string, input: CreateLinkInput): Promise<CreatorLink> {
    const profile = await this.ensureMe(userId);
    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenException('โปรไฟล์ Creator ยังไม่ ACTIVE');
    }

    // Validate references
    if (input.productId) {
      const prod = await this.prisma.product.findUnique({ where: { id: input.productId } });
      if (!prod) throw new NotFoundException('ไม่พบสินค้า');
      if (prod.status !== 'ACTIVE') throw new BadRequestException('สินค้านี้ยังไม่เปิดขาย');
    }
    let shopId = input.shopId ?? null;
    if (input.productId && !shopId) {
      const prod = await this.prisma.product.findUnique({ where: { id: input.productId } });
      shopId = prod?.shopId ?? null;
    }
    if (input.shopId) {
      const shop = await this.prisma.shop.findUnique({ where: { id: input.shopId } });
      if (!shop) throw new NotFoundException('ไม่พบร้านค้า');
    }

    // Find unique short code (retry a few times if collision)
    let code = '';
    for (let i = 0; i < 8; i++) {
      const tentative = newShortCode();
      const dup = (await this.prisma.$queryRawUnsafe(
        `SELECT id FROM creator_links WHERE code = ?`,
        tentative,
      )) as Array<{ id: string }>;
      if (dup.length === 0) {
        code = tentative;
        break;
      }
    }
    if (!code) throw new Error('ไม่สามารถสร้างลิงก์ที่ไม่ซ้ำได้ ลองใหม่อีกครั้ง');

    const id = newId('lnk');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO creator_links (id, creatorId, code, productId, shopId, label, commissionBps, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      id,
      profile.id,
      code,
      input.productId ?? null,
      shopId,
      input.label ?? null,
      input.commissionBps ?? null,
    );
    const link = await this.getLinkById(id);
    if (!link) throw new Error('Link insert failed');
    return link;
  }

  async listMyLinks(userId: string): Promise<CreatorLink[]> {
    const profile = await this.ensureMe(userId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, creatorId, code, productId, shopId, label, commissionBps,
              clickCount, conversionCount, active, createdAt
         FROM creator_links WHERE creatorId = ?
         ORDER BY createdAt DESC`,
      profile.id,
    )) as DbLink[];
    return rows.map((r) => this.toLink(r));
  }

  async getMyLink(userId: string, linkId: string): Promise<CreatorLink> {
    const profile = await this.ensureMe(userId);
    const link = await this.getLinkById(linkId);
    if (!link) throw new NotFoundException('ไม่พบลิงก์');
    if (link.creatorId !== profile.id) throw new ForbiddenException('ไม่ใช่ลิงก์ของคุณ');
    return link;
  }

  async resolve(code: string): Promise<LinkResolve> {
    const linkRows = (await this.prisma.$queryRawUnsafe(
      `SELECT cl.id, cl.code, cl.productId, cl.shopId, cl.label, cl.commissionBps, cl.active,
              cp.id AS creatorProfileId, cp.displayName AS creatorName, cp.avatarUrl AS creatorAvatar
         FROM creator_links cl
         INNER JOIN creator_profiles cp ON cp.id = cl.creatorId
         WHERE cl.code = ?`,
      code,
    )) as Array<{
      id: string;
      code: string;
      productId: string | null;
      shopId: string | null;
      label: string | null;
      commissionBps: number | null;
      active: number;
      creatorProfileId: string;
      creatorName: string;
      creatorAvatar: string | null;
    }>;

    const row = linkRows[0];
    if (!row) throw new NotFoundException('ไม่พบลิงก์');
    if (row.active === 0) throw new BadRequestException('ลิงก์นี้ถูกปิดการใช้งาน');

    let product: LinkResolve['product'] = null;
    if (row.productId) {
      const p = await this.prisma.product.findUnique({
        where: { id: row.productId },
        include: { media: true },
      });
      if (p && p.status === 'ACTIVE') {
        const media = [...p.media].sort((a, b) => a.sort - b.sort)[0];
        product = {
          id: p.id,
          name: p.name,
          priceCents: p.priceCents,
          mediaUrl: media?.url ?? null,
        };
      }
    }

    let shop: LinkResolve['shop'] = null;
    if (row.shopId) {
      const s = await this.prisma.shop.findUnique({ where: { id: row.shopId } });
      if (s) {
        shop = { id: s.id, name: s.name, slug: s.slug };
      }
    }

    return {
      code: row.code,
      productId: row.productId,
      shopId: row.shopId,
      label: row.label,
      creator: {
        id: row.creatorProfileId,
        displayName: row.creatorName,
        avatarUrl: row.creatorAvatar,
      },
      product,
      shop,
    };
  }

  async trackClick(
    code: string,
    ctx: { ua?: string; ref?: string; fingerprint?: string },
  ): Promise<{ ok: true }> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM creator_links WHERE code = ?`,
      code,
    )) as Array<{ id: string }>;
    const first = rows[0];
    if (!first) return { ok: true };
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO affiliate_clicks (id, linkId, fingerprint, ua, refererUrl) VALUES (?, ?, ?, ?, ?)`,
      newId('clk'),
      first.id,
      ctx.fingerprint ?? null,
      ctx.ua ?? null,
      ctx.ref ?? null,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE creator_links SET clickCount = clickCount + 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      first.id,
    );
    return { ok: true };
  }

  // -----------------------------------------------------------------------
  // Attribution lifecycle — called by Checkout/Order services
  // -----------------------------------------------------------------------

  /**
   * Called at checkout time. Creates an attribution row + calculates commission
   * snapshot based on link's commissionBps (override) or creator's default.
   * Returns null if code is invalid / inactive / refers to a different shop.
   */
  async attributeOrder(
    code: string,
    order: { id: string; shopId: string; subtotalCents: number; productIds: string[] },
  ): Promise<AffiliateAttribution | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT cl.id, cl.code, cl.creatorId, cl.productId, cl.shopId, cl.commissionBps, cl.active,
              cp.defaultCommissionBps AS creatorDefaultBps, cp.status AS creatorStatus
         FROM creator_links cl
         INNER JOIN creator_profiles cp ON cp.id = cl.creatorId
         WHERE cl.code = ?`,
      code,
    )) as Array<{
      id: string;
      code: string;
      creatorId: string;
      productId: string | null;
      shopId: string | null;
      commissionBps: number | null;
      active: number;
      creatorDefaultBps: number;
      creatorStatus: string;
    }>;
    const row = rows[0];
    if (!row) return null;
    if (row.active === 0 || row.creatorStatus !== 'ACTIVE') return null;

    // Match scope:
    // - If link is product-scoped, the order must include that product.
    // - If link is shop-scoped, the order must be for that shop.
    // - If link has neither (shouldn't happen), accept globally.
    if (row.productId && !order.productIds.includes(row.productId)) return null;
    if (row.shopId && row.shopId !== order.shopId) return null;

    const bps = row.commissionBps ?? row.creatorDefaultBps;
    const commissionCents = Math.floor((order.subtotalCents * bps) / 10000);
    if (commissionCents <= 0) return null;

    const attId = newId('att');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO affiliate_attributions
        (id, orderId, linkId, creatorId, shopId, productId, commissionBps, commissionCents, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      attId,
      order.id,
      row.id,
      row.creatorId,
      order.shopId,
      row.productId,
      bps,
      commissionCents,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE creator_links
         SET conversionCount = conversionCount + 1, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      row.id,
    );
    return {
      id: attId,
      orderId: order.id,
      linkId: row.id,
      linkCode: row.code,
      creatorId: row.creatorId,
      shopId: order.shopId,
      productId: row.productId,
      commissionBps: bps,
      commissionCents,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      releasedAt: null,
    };
  }

  /**
   * Called when an order is COMPLETED (escrow release).
   * Returns the commissionCents to deduct from merchant release (0 if no attribution).
   */
  async releaseForOrder(orderId: string): Promise<number> {
    const rows = (await this.getAttributionByOrder(orderId)).pendingOrNull;
    if (!rows) return 0;

    // Add to creator's available wallet + entry
    await this.creditCreator(rows.creatorId, rows.commissionCents, orderId);

    // Update attribution status + roll-up stats
    await this.prisma.$executeRawUnsafe(
      `UPDATE affiliate_attributions SET status='RELEASED', releasedAt=CURRENT_TIMESTAMP WHERE id = ?`,
      rows.id,
    );
    // Roll-up creator profile totals
    await this.prisma.$executeRawUnsafe(
      `UPDATE creator_profiles
         SET totalSalesCents = totalSalesCents + (
              SELECT subtotalCents FROM orders WHERE id = ?
            ),
             totalCommissionCents = totalCommissionCents + ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      orderId,
      rows.commissionCents,
      rows.creatorId,
    );
    return rows.commissionCents;
  }

  /** Called when an order is REFUNDED (escrow refund). */
  async reverseForOrder(orderId: string): Promise<void> {
    const rows = (await this.getAttributionByOrder(orderId)).pendingOrNull;
    if (!rows) return;
    await this.prisma.$executeRawUnsafe(
      `UPDATE affiliate_attributions SET status='REVERSED' WHERE id = ?`,
      rows.id,
    );
  }

  async myAttributions(userId: string): Promise<AffiliateAttribution[]> {
    const profile = await this.ensureMe(userId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT a.id, a.orderId, a.linkId, cl.code AS linkCode, a.creatorId, a.shopId,
              a.productId, a.commissionBps, a.commissionCents, a.status, a.createdAt, a.releasedAt
         FROM affiliate_attributions a
         INNER JOIN creator_links cl ON cl.id = a.linkId
         WHERE a.creatorId = ?
         ORDER BY a.createdAt DESC
         LIMIT 200`,
      profile.id,
    )) as DbAttribution[];
    return rows.map((r) => this.toAttribution(r));
  }

  async myStats(userId: string): Promise<CreatorStats> {
    const profile = await this.ensureMe(userId);

    const linkAgg = (await this.prisma.$queryRawUnsafe(
      `SELECT
          COUNT(*) AS totalLinks,
          SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS activeLinks,
          COALESCE(SUM(clickCount), 0) AS totalClicks,
          COALESCE(SUM(conversionCount), 0) AS totalConversions
         FROM creator_links WHERE creatorId = ?`,
      profile.id,
    )) as Array<{
      totalLinks: number;
      activeLinks: number;
      totalClicks: number;
      totalConversions: number;
    }>;

    const attAgg = (await this.prisma.$queryRawUnsafe(
      `SELECT
          COALESCE(SUM(CASE WHEN status='PENDING' THEN commissionCents ELSE 0 END), 0) AS pending,
          COALESCE(SUM(CASE WHEN status='RELEASED' THEN commissionCents ELSE 0 END), 0) AS released
         FROM affiliate_attributions WHERE creatorId = ?`,
      profile.id,
    )) as Array<{ pending: number; released: number }>;

    const l = linkAgg[0] ?? { totalLinks: 0, activeLinks: 0, totalClicks: 0, totalConversions: 0 };
    const a = attAgg[0] ?? { pending: 0, released: 0 };
    return {
      totalLinks: Number(l.totalLinks),
      activeLinks: Number(l.activeLinks),
      totalClicks: Number(l.totalClicks),
      totalConversions: Number(l.totalConversions),
      totalSalesCents: profile.totalSalesCents,
      pendingCommissionCents: Number(a.pending),
      releasedCommissionCents: Number(a.released),
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async creditCreator(creatorProfileId: string, amountCents: number, orderId: string) {
    // Look up the user behind the creator profile
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT userId FROM creator_profiles WHERE id = ?`,
      creatorProfileId,
    )) as Array<{ userId: string }>;
    const first = rows[0];
    if (!first) return;

    const wallet = await this.wallet.getOrCreate(first.userId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE wallets SET availableCents = availableCents + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      amountCents,
      wallet.id,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO wallet_entries (id, walletId, kind, amountCents, orderId, description)
       VALUES (?, ?, 'COMMISSION_EARN', ?, ?, ?)`,
      newId('we'),
      wallet.id,
      amountCents,
      orderId,
      'รับคอมมิชชั่นจากออเดอร์',
    );
  }

  private async getAttributionByOrder(
    orderId: string,
  ): Promise<{ pendingOrNull: DbAttribution | null }> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT a.id, a.orderId, a.linkId, cl.code AS linkCode, a.creatorId, a.shopId,
              a.productId, a.commissionBps, a.commissionCents, a.status, a.createdAt, a.releasedAt
         FROM affiliate_attributions a
         INNER JOIN creator_links cl ON cl.id = a.linkId
         WHERE a.orderId = ? AND a.status = 'PENDING'`,
      orderId,
    )) as DbAttribution[];
    return { pendingOrNull: rows[0] ?? null };
  }

  private async findByUser(userId: string): Promise<CreatorProfile | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, displayName, bio, avatarUrl, socialJson, status,
              defaultCommissionBps, totalSalesCents, totalCommissionCents, createdAt
         FROM creator_profiles WHERE userId = ?`,
      userId,
    )) as DbProfile[];
    const first = rows[0];
    return first ? this.toProfile(first) : null;
  }

  private async getLinkById(id: string): Promise<CreatorLink | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, creatorId, code, productId, shopId, label, commissionBps,
              clickCount, conversionCount, active, createdAt
         FROM creator_links WHERE id = ?`,
      id,
    )) as DbLink[];
    const first = rows[0];
    return first ? this.toLink(first) : null;
  }

  private toProfile(r: DbProfile): CreatorProfile {
    let social: SocialAccount[] = [];
    try {
      social = JSON.parse(r.socialJson || '[]') as SocialAccount[];
    } catch {
      social = [];
    }
    return {
      id: r.id,
      userId: r.userId,
      displayName: r.displayName,
      bio: r.bio,
      avatarUrl: r.avatarUrl,
      social,
      status: r.status as CreatorStatus,
      defaultCommissionBps: Number(r.defaultCommissionBps),
      totalSalesCents: Number(r.totalSalesCents),
      totalCommissionCents: Number(r.totalCommissionCents),
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }

  private toLink(r: DbLink): CreatorLink {
    return {
      id: r.id,
      creatorId: r.creatorId,
      code: r.code,
      productId: r.productId,
      shopId: r.shopId,
      label: r.label,
      commissionBps: r.commissionBps,
      clickCount: Number(r.clickCount),
      conversionCount: Number(r.conversionCount),
      active: Number(r.active) === 1,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }

  private toAttribution(r: DbAttribution): AffiliateAttribution {
    return {
      id: r.id,
      orderId: r.orderId,
      linkId: r.linkId,
      linkCode: r.linkCode,
      creatorId: r.creatorId,
      shopId: r.shopId,
      productId: r.productId,
      commissionBps: Number(r.commissionBps),
      commissionCents: Number(r.commissionCents),
      status: r.status as AttributionStatus,
      createdAt: new Date(r.createdAt).toISOString(),
      releasedAt: r.releasedAt ? new Date(r.releasedAt).toISOString() : null,
    };
  }
}
