import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  NotificationChannel,
  NotificationConfig,
  NotificationPayload,
  NotificationTopic,
} from '../../shared/types';
import { ApnsAdapter } from './adapters/apns.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { FcmAdapter } from './adapters/fcm.adapter';
import { InAppAdapter } from './adapters/inapp.adapter';
import { LineAdapter } from './adapters/line.adapter';
import { AdapterRecipient, AdapterResult, ChannelAdapter } from './adapters/types';
import { WebPushAdapter } from './adapters/web-push.adapter';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

interface UserContact {
  userId: string;
  email: string | null;
  fcmTokens: string[];
  apnsTokens: string[];
  webPush: Array<{ endpoint: string; p256dh: string; auth: string }>;
  lineUserId: string | null;
  mutedChannels: Set<string>;
}

/**
 * High-level facade used by BroadcastService / cron jobs / transactional flows.
 *
 * Responsibilities:
 *   - Resolve user → contact methods (email / push subs / line)
 *   - Honour notification_prefs (skip muted channels per topic)
 *   - Dispatch to adapters, log every attempt to notification_logs
 *   - Track per-channel sent / failed / skipped counters
 *
 * TRANSACTIONAL topic bypasses opt-out (you can't mute payment receipts).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly adapters: Map<NotificationChannel, ChannelAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    inapp: InAppAdapter,
    webPush: WebPushAdapter,
    fcm: FcmAdapter,
    apns: ApnsAdapter,
    email: EmailAdapter,
    line: LineAdapter,
  ) {
    this.adapters = new Map<NotificationChannel, ChannelAdapter>([
      ['INAPP', inapp],
      ['WEB_PUSH', webPush],
      ['FCM', fcm],
      ['APNS', apns],
      ['EMAIL', email],
      ['LINE', line],
    ]);
  }

  /** Snapshot of which adapters are wired (frontend uses to render channel toggles). */
  getConfig(): NotificationConfig {
    return {
      webPushEnabled:
        this.adapters.get('WEB_PUSH')?.isReady() ?? false,
      vapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC || null,
      fcmEnabled: this.adapters.get('FCM')?.isReady() ?? false,
      apnsEnabled: this.adapters.get('APNS')?.isReady() ?? false,
      emailEnabled: this.adapters.get('EMAIL')?.isReady() ?? false,
      lineEnabled: this.adapters.get('LINE')?.isReady() ?? false,
      lineLiffId: process.env.LINE_LIFF_ID || null,
    };
  }

  /**
   * Send a single notification to one user across `channels` (or "auto"
   * fan-out across all ready channels with available destinations).
   */
  async notifyUser(
    userId: string,
    channels: NotificationChannel[] | 'AUTO',
    topic: NotificationTopic,
    payload: NotificationPayload,
    opts: { broadcastId?: string | null } = {},
  ): Promise<AdapterResult[]> {
    const contact = await this.loadContact(userId);
    const targets = channels === 'AUTO' ? this.autoChannels(contact) : channels;
    const out: AdapterResult[] = [];
    for (const ch of targets) {
      const r = await this.dispatchOne(contact, ch, topic, payload, opts);
      out.push(r);
    }
    return out;
  }

  /**
   * Bulk fan-out for broadcasts. Concurrency-limited so SQLite + provider rate
   * limits don't get hammered. Returns aggregate counts.
   */
  async fanOut(
    userIds: string[],
    channel: NotificationChannel,
    topic: NotificationTopic,
    payload: NotificationPayload,
    opts: { broadcastId?: string | null; concurrency?: number } = {},
  ): Promise<{ ok: number; failed: number; skipped: number }> {
    const concurrency = opts.concurrency ?? 8;
    let ok = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < userIds.length; i += concurrency) {
      const slice = userIds.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        slice.map(async (uid) => {
          const contact = await this.loadContact(uid);
          return this.dispatchOne(contact, channel, topic, payload, opts);
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.status === 'OK') ok++;
          else if (r.value.status === 'FAIL') failed++;
          else skipped++;
        } else {
          failed++;
        }
      }
    }
    return { ok, failed, skipped };
  }

  /** Used internally + by broadcast.service to share consistent logging. */
  async dispatchOne(
    contact: UserContact,
    channel: NotificationChannel,
    topic: NotificationTopic,
    payload: NotificationPayload,
    opts: { broadcastId?: string | null } = {},
  ): Promise<AdapterResult> {
    const t0 = Date.now();
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      const res: AdapterResult = {
        status: 'SKIPPED',
        channel,
        error: 'no-adapter',
      };
      await this.log(contact.userId, res, topic, opts.broadcastId, 0);
      return res;
    }

    // Honour opt-out — but never on transactional traffic
    if (
      topic !== 'TRANSACTIONAL' &&
      (contact.mutedChannels.has(channel) ||
        contact.mutedChannels.has(`${channel}:${topic}`))
    ) {
      const res: AdapterResult = {
        status: 'SKIPPED',
        channel,
        error: 'muted',
      };
      await this.log(contact.userId, res, topic, opts.broadcastId, 0);
      return res;
    }

    const recipient: AdapterRecipient = {
      userId: contact.userId,
      webPush: contact.webPush,
      fcmTokens: contact.fcmTokens,
      apnsTokens: contact.apnsTokens,
      email: contact.email,
      lineUserId: contact.lineUserId,
    };

    let res: AdapterResult;
    try {
      res = await adapter.send(recipient, payload, topic);
    } catch (e) {
      res = {
        status: 'FAIL',
        channel,
        error: e instanceof Error ? e.message.slice(0, 200) : 'adapter-throw',
      };
    }
    await this.log(
      contact.userId,
      res,
      topic,
      opts.broadcastId,
      Date.now() - t0,
    );
    return res;
  }

  private autoChannels(contact: UserContact): NotificationChannel[] {
    const list: NotificationChannel[] = ['INAPP'];
    if (
      this.adapters.get('WEB_PUSH')?.isReady() &&
      contact.webPush.length > 0
    ) {
      list.push('WEB_PUSH');
    }
    if (
      this.adapters.get('FCM')?.isReady() &&
      (contact.fcmTokens.length > 0 || contact.apnsTokens.length > 0)
    ) {
      list.push('FCM');
    } else if (
      this.adapters.get('APNS')?.isReady() &&
      contact.apnsTokens.length > 0
    ) {
      list.push('APNS');
    }
    if (this.adapters.get('EMAIL')?.isReady() && contact.email) {
      list.push('EMAIL');
    }
    if (this.adapters.get('LINE')?.isReady() && contact.lineUserId) {
      list.push('LINE');
    }
    return list;
  }

  private async loadContact(userId: string): Promise<UserContact> {
    const userRows = (await this.prisma.$queryRawUnsafe(
      `SELECT email FROM users WHERE id = ?`,
      userId,
    )) as Array<{ email: string | null }>;
    const email = userRows[0]?.email ?? null;

    const devices = (await this.prisma.$queryRawUnsafe(
      `SELECT platform, token FROM user_devices WHERE userId = ?`,
      userId,
    )) as Array<{ platform: string; token: string }>;
    const fcmTokens = devices
      .filter((d) => d.platform === 'android' || d.platform === 'web')
      .map((d) => d.token);
    const apnsTokens = devices
      .filter((d) => d.platform === 'ios')
      .map((d) => d.token);

    const subs = (await this.prisma.$queryRawUnsafe(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE userId = ?`,
      userId,
    )) as Array<{ endpoint: string; p256dh: string; auth: string }>;

    const lineRows = (await this.prisma.$queryRawUnsafe(
      `SELECT lineUserId FROM line_links WHERE userId = ?`,
      userId,
    )) as Array<{ lineUserId: string }>;
    const lineUserId = lineRows[0]?.lineUserId ?? null;

    const prefs = (await this.prisma.$queryRawUnsafe(
      `SELECT channel, topic FROM notification_prefs WHERE userId = ? AND muted = 1`,
      userId,
    )) as Array<{ channel: string; topic: string }>;
    const mutedChannels = new Set<string>();
    for (const p of prefs) {
      mutedChannels.add(p.topic === '*' ? p.channel : `${p.channel}:${p.topic}`);
    }

    return {
      userId,
      email,
      fcmTokens,
      apnsTokens,
      webPush: subs,
      lineUserId,
      mutedChannels,
    };
  }

  private async log(
    userId: string,
    res: AdapterResult,
    topic: NotificationTopic,
    broadcastId: string | null | undefined,
    durationMs: number,
  ): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notification_logs
          (id, broadcastId, userId, channel, topic, status, error,
           providerMessageId, durationMs, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        newId('nlog'),
        broadcastId ?? null,
        userId,
        res.channel,
        topic,
        res.status,
        res.error ?? null,
        res.providerMessageId ?? null,
        Math.max(0, Math.round(durationMs)),
      );
    } catch (e) {
      // never break the caller for telemetry
      this.logger.warn(
        `[notif-log] insert failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}
