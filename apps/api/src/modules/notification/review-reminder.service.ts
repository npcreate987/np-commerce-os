import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../integration/notification.service';

/**
 * Phase 9.1 — automatic review-reminder broadcasts.
 *
 * Algorithm (runs hourly, idempotent):
 *   1) Find orders that hit `status = 'DELIVERED'` 72-168 hours ago AND
 *      have at least one product line that doesn't have a review by the
 *      same (orderId, productId, customerId).
 *   2) Skip if we've already sent a REVIEW_REMINDER for the same orderId
 *      (deduped via `notification_logs.providerMessageId = 'rr:<orderId>'`).
 *   3) Fire via NotificationService AUTO across whatever channels the user
 *      hasn't muted (TRANSACTIONAL-style: cheap product feedback, not
 *      marketing — but respects per-user opt-out).
 *
 * Window cap of 168 hours so we don't spam old orders if migration adds
 * historical DELIVERED rows; the dedupe protects against the rare race
 * where two job ticks overlap.
 */
@Injectable()
export class ReviewReminderService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReviewReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly enabled =
    (process.env.REVIEW_REMINDER ?? 'on').toLowerCase() !== 'off';
  private readonly intervalMs = Math.max(
    60_000,
    Number(process.env.REVIEW_REMINDER_INTERVAL_MS ?? 60 * 60 * 1000),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('review-reminder disabled via REVIEW_REMINDER=off');
      return;
    }
    // Stagger first run by 30s so we don't dogpile bootstrap migrations
    setTimeout(() => void this.tick(), 30_000);
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.logger.log(
      `review-reminder scheduled every ${Math.round(
        this.intervalMs / 60000,
      )} min`,
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Public for testing / manual admin trigger. */
  async tick(): Promise<{ scanned: number; sent: number }> {
    const startedAt = Date.now();
    try {
      // Pull DELIVERED orders inside the 72h-168h window that don't yet
      // have a notification_logs entry for our dedupe key.
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT o.id AS orderId, o.customerId, o.shopId,
                o.totalCents, o.updatedAt
         FROM orders o
         WHERE o.status = 'DELIVERED'
           AND o.updatedAt <= datetime('now', '-72 hours')
           AND o.updatedAt >  datetime('now', '-168 hours')
           AND NOT EXISTS (
             SELECT 1 FROM notification_logs nl
             WHERE nl.providerMessageId = 'rr:' || o.id
           )
         LIMIT 200`,
      )) as Array<{
        orderId: string;
        customerId: string;
        shopId: string;
        totalCents: number;
        updatedAt: string;
      }>;

      let sent = 0;
      for (const r of rows) {
        // Skip if this order has been fully reviewed already
        const pending = (await this.prisma.$queryRawUnsafe(
          `SELECT COUNT(*) AS cnt
           FROM order_items oi
           WHERE oi.orderId = ?
             AND NOT EXISTS (
               SELECT 1 FROM reviews rv
               WHERE rv.orderId = oi.orderId
                 AND rv.productId = oi.productId
                 AND rv.customerId = ?
             )`,
          r.orderId,
          r.customerId,
        )) as Array<{ cnt: number }>;
        if (!pending[0] || pending[0].cnt === 0) {
          // mark as done (so we don't keep scanning a fully-reviewed order)
          await this.writeDedupe(r.orderId, r.customerId, 'SKIPPED');
          continue;
        }

        const results = await this.notif.notifyUser(
          r.customerId,
          'AUTO',
          'REVIEW_REMINDER',
          {
            title: '⭐ ของถึงแล้ว ลองรีวิวสิ',
            body: 'ออเดอร์เสร็จสมบูรณ์แล้ว แบ่งปันประสบการณ์ให้ร้านและเพื่อนคนต่อไป',
            url: `/orders/${r.orderId}`,
            tag: `review-${r.orderId}`,
          },
        );
        const anyOk = results.some((x) => x.status === 'OK');
        await this.writeDedupe(r.orderId, r.customerId, anyOk ? 'OK' : 'FAIL');
        if (anyOk) sent++;
      }
      this.logger.log(
        `review-reminder tick: scanned=${rows.length} sent=${sent} ms=${Date.now() - startedAt}`,
      );
      return { scanned: rows.length, sent };
    } catch (e) {
      this.logger.warn(
        `review-reminder tick failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return { scanned: 0, sent: 0 };
    }
  }

  /**
   * Write a sentinel row to `notification_logs` so the next tick won't
   * re-scan this order. We piggy-back on the existing log table — the
   * `providerMessageId = 'rr:<orderId>'` convention is used by the SQL
   * filter above.
   */
  private async writeDedupe(
    orderId: string,
    userId: string,
    status: 'OK' | 'FAIL' | 'SKIPPED',
  ): Promise<void> {
    const id = `rrlog_${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notification_logs
          (id, broadcastId, userId, channel, topic, status, error,
           providerMessageId, durationMs, createdAt)
         VALUES (?, NULL, ?, 'INAPP', 'REVIEW_REMINDER', ?, NULL, ?, 0,
                 CURRENT_TIMESTAMP)`,
        id,
        userId,
        status,
        `rr:${orderId}`,
      );
    } catch {
      // ignore — duplicate dedupe row simply means another tick beat us
    }
  }
}
