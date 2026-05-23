import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Broadcast,
  CreateBroadcastInput,
  InAppMessage,
  NotificationChannel,
} from '../../shared/types';
import { NotificationService } from '../integration/notification.service';

interface DbBroadcast {
  id: string;
  shopId: string | null;
  channel: string;
  title: string;
  body: string;
  audience: string;
  status: string;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbInApp {
  id: string;
  userId: string;
  broadcastId: string | null;
  title: string;
  body: string;
  ctaJson: string;
  read: number;
  createdAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function toBroadcast(d: DbBroadcast): Broadcast {
  return {
    id: d.id,
    shopId: d.shopId,
    channel: d.channel as Broadcast['channel'],
    title: d.title,
    body: d.body,
    audience: d.audience as Broadcast['audience'],
    status: d.status as Broadcast['status'],
    sentCount: d.sentCount,
    failedCount: d.failedCount,
    scheduledAt: d.scheduledAt,
    sentAt: d.sentAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toInApp(d: DbInApp): InAppMessage {
  return {
    id: d.id,
    userId: d.userId,
    broadcastId: d.broadcastId,
    title: d.title,
    body: d.body,
    ctaJson: d.ctaJson,
    read: d.read === 1,
    createdAt: d.createdAt,
  };
}

/**
 * Map legacy Broadcast.channel enum (Phase 5) → Phase 9 delivery channels.
 *
 * - 'INAPP' → INAPP only
 * - 'PUSH'  → fan out across WEB_PUSH + FCM/APNs (handled by NotificationService)
 * - 'EMAIL' → EMAIL
 * - 'LINE'  → LINE
 *
 * Every channel mode ALSO writes an in-app message so the inbox stays
 * authoritative — push/email/line are "extra reach" surfaces.
 */
function mapChannel(legacy: string): NotificationChannel[] {
  switch (legacy) {
    case 'INAPP':
      return ['INAPP'];
    case 'PUSH':
      return ['INAPP', 'WEB_PUSH', 'FCM', 'APNS'];
    case 'EMAIL':
      return ['INAPP', 'EMAIL'];
    case 'LINE':
      return ['INAPP', 'LINE'];
    default:
      return ['INAPP'];
  }
}

@Injectable()
export class BroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationService,
  ) {}

  // -------- Merchant / Admin --------

  async listForShop(ownerUserId: string, shopId: string): Promise<Broadcast[]> {
    await this.assertShopOwner(ownerUserId, shopId);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM broadcasts WHERE shopId = ? ORDER BY createdAt DESC`,
      shopId,
    )) as DbBroadcast[];
    return rows.map(toBroadcast);
  }

  async create(ownerUserId: string, input: CreateBroadcastInput): Promise<Broadcast> {
    if (input.shopId) {
      await this.assertShopOwner(ownerUserId, input.shopId);
    }
    const id = newId('bc');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO broadcasts
        (id, shopId, channel, title, body, audience, status,
         sentCount, failedCount, scheduledAt, sentAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 0, 0, ?, NULL,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      input.shopId ?? null,
      input.channel,
      input.title,
      input.body,
      input.audience,
      input.scheduledAt ?? null,
    );
    const created = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM broadcasts WHERE id = ?`,
      id,
    )) as DbBroadcast[];
    return toBroadcast(created[0]);
  }

  /**
   * Fan-out — resolves the audience, then dispatches via NotificationService
   * across whatever channel mix the legacy Broadcast.channel maps to.
   *
   * `sentCount` is the count of users who received the message on AT LEAST
   * one channel (typically INAPP since it's always available); `failedCount`
   * counts users where every channel attempt failed. Channel-level breakdown
   * is in `notification_logs`.
   */
  async send(ownerUserId: string, broadcastId: string): Promise<Broadcast> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM broadcasts WHERE id = ?`,
      broadcastId,
    )) as DbBroadcast[];
    if (rows.length === 0) throw new NotFoundException('ไม่พบ broadcast');
    const b = rows[0];
    if (b.shopId) await this.assertShopOwner(ownerUserId, b.shopId);
    if (b.status === 'SENT') {
      throw new BadRequestException('ส่งไปแล้ว');
    }

    const recipientIds = await this.resolveAudience(b.shopId, b.audience);
    const channels = mapChannel(b.channel);

    let sent = 0;
    let failed = 0;

    for (const uid of recipientIds) {
      // ใช้ "anyOk" — ถ้าอย่างน้อย 1 channel สำเร็จ ก็ถือว่าผู้รับได้รับ
      let anyOk = false;
      for (const ch of channels) {
        const results = await this.notif.notifyUser(
          uid,
          [ch],
          'PROMOTIONAL',
          {
            title: b.title,
            body: b.body,
            url: '/inbox',
            tag: `bc-${b.id}`,
            data: { broadcastId: b.id },
          },
          { broadcastId: b.id },
        );
        if (results.some((r) => r.status === 'OK')) anyOk = true;
      }
      if (anyOk) sent++;
      else failed++;
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE broadcasts
       SET status = 'SENT', sentCount = ?, failedCount = ?,
           sentAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      sent,
      failed,
      broadcastId,
    );
    const refreshed = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM broadcasts WHERE id = ?`,
      broadcastId,
    )) as DbBroadcast[];
    return toBroadcast(refreshed[0]);
  }

  // -------- User in-app --------

  async listMine(userId: string, unreadOnly = false): Promise<InAppMessage[]> {
    const sql = unreadOnly
      ? `SELECT * FROM inapp_messages WHERE userId = ? AND read = 0
         ORDER BY createdAt DESC LIMIT 100`
      : `SELECT * FROM inapp_messages WHERE userId = ?
         ORDER BY createdAt DESC LIMIT 100`;
    const rows = (await this.prisma.$queryRawUnsafe(sql, userId)) as DbInApp[];
    return rows.map(toInApp);
  }

  async markRead(userId: string, messageId: string): Promise<{ ok: true }> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE inapp_messages SET read = 1 WHERE id = ? AND userId = ?`,
      messageId,
      userId,
    );
    return { ok: true };
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE inapp_messages SET read = 1 WHERE userId = ?`,
      userId,
    );
    return { ok: true };
  }

  // -------- Helpers --------

  /** Public-ish: preview audience size before sending. */
  async audienceCount(
    ownerUserId: string,
    shopId: string | null,
    audience: string,
  ): Promise<number> {
    if (shopId) await this.assertShopOwner(ownerUserId, shopId);
    const ids = await this.resolveAudience(shopId, audience);
    return ids.length;
  }

  private async resolveAudience(
    shopId: string | null,
    audience: string,
  ): Promise<string[]> {
    if (audience === 'ALL') {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT id FROM users WHERE role = 'CUSTOMER' LIMIT 5000`,
      )) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    if (audience === 'BUYERS' && shopId) {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT DISTINCT customerId AS id FROM orders WHERE shopId = ? LIMIT 5000`,
        shopId,
      )) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    if (audience === 'BUYERS') {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT DISTINCT customerId AS id FROM orders LIMIT 5000`,
      )) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    if (audience === 'ABANDONED_CART') {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT DISTINCT c.userId AS id
         FROM carts c
         WHERE EXISTS (SELECT 1 FROM cart_items ci WHERE ci.cartId = c.id)
         LIMIT 5000`,
      )) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    if (audience === 'WIN_BACK') {
      // ลูกค้าที่สั่งครั้งสุดท้าย >30 วัน
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const baseSql = shopId
        ? `SELECT customerId AS id FROM orders WHERE shopId = ?
           GROUP BY customerId HAVING MAX(createdAt) < ? LIMIT 5000`
        : `SELECT customerId AS id FROM orders
           GROUP BY customerId HAVING MAX(createdAt) < ? LIMIT 5000`;
      const args = shopId ? [shopId, cutoff] : [cutoff];
      const rows = (await this.prisma.$queryRawUnsafe(
        baseSql,
        ...args,
      )) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    if (audience === 'VIP') {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT userId AS id FROM loyalty_accounts WHERE tier IN ('GOLD','PLATINUM') LIMIT 5000`,
      )) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    if (audience.startsWith('SEG_') && shopId) {
      return this.resolveSegment(shopId, audience);
    }
    return [];
  }

  /**
   * RFM segment resolution — mirrors logic in InsightsService.segments().
   * Cross-module duplication kept on purpose (low coupling).
   */
  private async resolveSegment(
    shopId: string,
    audience: string,
  ): Promise<string[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT o.customerId AS id,
              COUNT(*) AS freq,
              COALESCE(SUM(o.totalCents - COALESCE(o.discountCents, 0)), 0) AS gmv,
              julianday('now') - julianday(MAX(o.createdAt)) AS recencyDays
       FROM orders o
       WHERE o.shopId = ?
         AND o.status NOT IN ('CANCELLED')
       GROUP BY o.customerId`,
      shopId,
    )) as Array<{
      id: string;
      freq: number;
      gmv: number;
      recencyDays: number;
    }>;
    if (rows.length === 0) return [];

    const gmvs = rows.map((r) => r.gmv).sort((a, b) => a - b);
    const medianGmv = gmvs[Math.floor(gmvs.length / 2)];

    const wanted = audience.replace('SEG_', '');
    return rows
      .filter((r) => {
        const R = Math.floor(r.recencyDays);
        const F = r.freq;
        const M = r.gmv;
        const isLost = R > 90;
        const isChamp = !isLost && R <= 30 && F >= 3 && M >= medianGmv * 2;
        const isLoyal = !isLost && !isChamp && F >= 3 && M >= medianGmv;
        const isNew = !isLost && !isChamp && !isLoyal && R <= 14 && F <= 2;
        const isAtRisk =
          !isLost &&
          !isChamp &&
          !isLoyal &&
          !isNew &&
          F >= 2 &&
          R > 30 &&
          R <= 90;

        switch (wanted) {
          case 'CHAMPIONS':
            return isChamp;
          case 'LOYAL':
            return isLoyal;
          case 'NEW':
            return isNew;
          case 'AT_RISK':
            return isAtRisk;
          case 'LOST':
            return isLost;
          default:
            return false;
        }
      })
      .map((r) => r.id);
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
