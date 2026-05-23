import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Campaign,
  CampaignKind,
  CampaignProduct,
  CampaignProductView,
  CreateCampaignInput,
  JoinCampaignInput,
} from '../../shared/types';

interface DbCampaign {
  id: string;
  shopId: string | null;
  kind: string;
  title: string;
  description: string | null;
  value: number;
  metaJson: string;
  bannerUrl: string | null;
  startsAt: string;
  endsAt: string;
  active: number;
  createdAt: string;
  updatedAt: string;
}

interface DbCampaignProduct {
  id: string;
  campaignId: string;
  productId: string;
  flashPriceCents: number | null;
  stockCap: number;
  sold: number;
  createdAt: string;
}

interface DbProductLite {
  productId: string;
  productName: string;
  basePriceCents: number;
  shopId: string;
  shopName: string;
  mediaUrl: string | null;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function toCampaign(d: DbCampaign): Campaign {
  return {
    id: d.id,
    shopId: d.shopId,
    kind: d.kind as CampaignKind,
    title: d.title,
    description: d.description,
    value: d.value,
    metaJson: d.metaJson,
    bannerUrl: d.bannerUrl,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    active: d.active === 1,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toCampaignProduct(d: DbCampaignProduct): CampaignProduct {
  return {
    id: d.id,
    campaignId: d.campaignId,
    productId: d.productId,
    flashPriceCents: d.flashPriceCents,
    stockCap: d.stockCap,
    sold: d.sold,
    createdAt: d.createdAt,
  };
}

@Injectable()
export class CampaignService {
  constructor(private readonly prisma: PrismaService) {}

  // -------- Public discovery --------

  async listActive(kind?: CampaignKind): Promise<Campaign[]> {
    const nowIso = new Date().toISOString();
    const params: unknown[] = [nowIso, nowIso];
    let sql = `SELECT * FROM campaigns
       WHERE active = 1 AND startsAt <= ? AND endsAt >= ?`;
    if (kind) {
      sql += ` AND kind = ?`;
      params.push(kind);
    }
    sql += ` ORDER BY startsAt DESC LIMIT 50`;
    const rows = (await this.prisma.$queryRawUnsafe(sql, ...params)) as DbCampaign[];
    return rows.map(toCampaign);
  }

  async getById(id: string): Promise<Campaign | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM campaigns WHERE id = ?`,
      id,
    )) as DbCampaign[];
    return rows.length ? toCampaign(rows[0]) : null;
  }

  /**
   * รายการสินค้าที่อยู่ในแคมเปญ พร้อมข้อมูลสินค้าและคำนวณราคา flash
   */
  async listProducts(campaignId: string): Promise<CampaignProductView[]> {
    const camp = await this.getById(campaignId);
    if (!camp) throw new NotFoundException('ไม่พบแคมเปญ');

    const links = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM campaign_products WHERE campaignId = ? ORDER BY createdAt DESC`,
      campaignId,
    )) as DbCampaignProduct[];

    if (links.length === 0) return [];

    const ids = links.map((l) => l.productId);
    const placeholders = ids.map(() => '?').join(',');
    const products = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id AS productId, p.name AS productName,
              p.priceCents AS basePriceCents,
              p.shopId AS shopId,
              s.name AS shopName,
              (SELECT url FROM product_media m WHERE m.productId = p.id
                 ORDER BY position ASC LIMIT 1) AS mediaUrl
       FROM products p
       JOIN shops s ON s.id = p.shopId
       WHERE p.id IN (${placeholders})`,
      ...ids,
    )) as DbProductLite[];

    const byId = new Map(products.map((p) => [p.productId, p]));
    return links
      .map((l) => {
        const p = byId.get(l.productId);
        if (!p) return null;
        return {
          ...toCampaignProduct(l),
          productName: p.productName,
          basePriceCents: p.basePriceCents,
          mediaUrl: p.mediaUrl,
          shopId: p.shopId,
          shopName: p.shopName,
        } satisfies CampaignProductView;
      })
      .filter((x): x is CampaignProductView => x !== null);
  }

  // -------- Merchant / Admin --------

  async listForShop(ownerUserId: string, shopId: string): Promise<Campaign[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM campaigns WHERE shopId = ? ORDER BY createdAt DESC`,
      shopId,
    )) as DbCampaign[];
    return rows.map(toCampaign);
  }

  async create(ownerUserId: string, input: CreateCampaignInput): Promise<Campaign> {
    if (input.shopId) {
      await this.assertShopOwner(ownerUserId, input.shopId);
    }
    if (new Date(input.endsAt) <= new Date(input.startsAt)) {
      throw new BadRequestException('endsAt ต้องอยู่หลัง startsAt');
    }
    const id = newId('cam');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO campaigns
        (id, shopId, kind, title, description, value, metaJson, bannerUrl,
         startsAt, endsAt, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, 1,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      input.shopId ?? null,
      input.kind,
      input.title,
      input.description ?? null,
      input.value,
      input.bannerUrl ?? null,
      input.startsAt,
      input.endsAt,
    );
    const created = await this.getById(id);
    return created!;
  }

  async joinProduct(
    ownerUserId: string,
    campaignId: string,
    input: JoinCampaignInput,
  ): Promise<CampaignProduct> {
    const camp = await this.getById(campaignId);
    if (!camp) throw new NotFoundException('ไม่พบแคมเปญ');

    const prodRows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, shopId FROM products WHERE id = ?`,
      input.productId,
    )) as Array<{ id: string; shopId: string }>;
    if (prodRows.length === 0) throw new NotFoundException('ไม่พบสินค้า');

    // shopId ของ campaign ถ้ามี — ต้องเป็นเจ้าของเดียวกัน
    if (camp.shopId && camp.shopId !== prodRows[0].shopId) {
      throw new BadRequestException('สินค้าไม่ได้อยู่ในร้านของแคมเปญนี้');
    }
    await this.assertShopOwner(ownerUserId, prodRows[0].shopId);

    const dup = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM campaign_products WHERE campaignId = ? AND productId = ?`,
      campaignId,
      input.productId,
    )) as Array<{ id: string }>;
    if (dup.length > 0) {
      throw new BadRequestException('สินค้านี้อยู่ในแคมเปญแล้ว');
    }

    const id = newId('cmp');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO campaign_products
        (id, campaignId, productId, flashPriceCents, stockCap, sold, createdAt)
       VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
      id,
      campaignId,
      input.productId,
      input.flashPriceCents ?? null,
      input.stockCap,
    );
    const created = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM campaign_products WHERE id = ?`,
      id,
    )) as DbCampaignProduct[];
    return toCampaignProduct(created[0]);
  }

  async leaveProduct(
    ownerUserId: string,
    campaignId: string,
    productId: string,
  ): Promise<{ ok: true }> {
    const prodRows = (await this.prisma.$queryRawUnsafe(
      `SELECT shopId FROM products WHERE id = ?`,
      productId,
    )) as Array<{ shopId: string }>;
    if (prodRows.length === 0) throw new NotFoundException('ไม่พบสินค้า');
    await this.assertShopOwner(ownerUserId, prodRows[0].shopId);

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM campaign_products WHERE campaignId = ? AND productId = ?`,
      campaignId,
      productId,
    );
    return { ok: true };
  }

  async toggle(ownerUserId: string, campaignId: string, active: boolean): Promise<Campaign> {
    const camp = await this.getById(campaignId);
    if (!camp) throw new NotFoundException('ไม่พบแคมเปญ');
    if (camp.shopId) await this.assertShopOwner(ownerUserId, camp.shopId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE campaigns SET active = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      active ? 1 : 0,
      campaignId,
    );
    return (await this.getById(campaignId))!;
  }

  // -------- Helpers --------

  /**
   * ส่งคืน effective price สำหรับสินค้าใน flash deal ที่ active ตอนนี้
   * (สำหรับใช้ใน checkout เพื่อ override ราคา)
   */
  async flashPriceFor(productId: string): Promise<number | null> {
    const nowIso = new Date().toISOString();
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT cp.flashPriceCents, c.value, p.priceCents
       FROM campaign_products cp
       JOIN campaigns c ON c.id = cp.campaignId
       JOIN products p ON p.id = cp.productId
       WHERE cp.productId = ?
         AND c.kind = 'FLASH_DEAL'
         AND c.active = 1
         AND c.startsAt <= ?
         AND c.endsAt >= ?
       ORDER BY c.startsAt DESC LIMIT 1`,
      productId,
      nowIso,
      nowIso,
    )) as Array<{
      flashPriceCents: number | null;
      value: number;
      priceCents: number;
    }>;
    if (rows.length === 0) return null;
    const r = rows[0];
    if (r.flashPriceCents != null) return r.flashPriceCents;
    // คำนวณจาก % off
    const off = Math.floor((r.priceCents * r.value) / 10000);
    return Math.max(0, r.priceCents - off);
  }

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
