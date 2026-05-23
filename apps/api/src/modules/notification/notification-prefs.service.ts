import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  LineLink,
  NotificationPref,
  PushSubscription,
  RegisterDeviceInput,
  SubscribePushInput,
  UpdateNotificationPrefInput,
  UserDevice,
  LinkLineInput,
} from '../../shared/types';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

interface DbSub {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  platform: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface DbDevice {
  id: string;
  userId: string;
  platform: string;
  token: string;
  deviceId: string | null;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface DbLine {
  id: string;
  userId: string;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbPref {
  id: string;
  userId: string;
  channel: string;
  topic: string;
  muted: number;
  updatedAt: string;
}

/**
 * Combined CRUD for everything stored by Phase 9.1 bootstrap:
 *
 *   - push_subscriptions  (Web Push, 1 user → many endpoints)
 *   - user_devices        (Capacitor FCM/APNs, 1 user → many tokens)
 *   - line_links          (1 user → 1 line account)
 *   - notification_prefs  (opt-out, default ON)
 *
 * Kept in one service to avoid module sprawl — these tables are small
 * read-write surface and share the "owned by userId" auth invariant.
 */
@Injectable()
export class NotificationPrefsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Push Subscriptions (Web Push / VAPID) ----------

  async subscribePush(
    userId: string,
    input: SubscribePushInput,
  ): Promise<PushSubscription> {
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM push_subscriptions WHERE endpoint = ?`,
      input.endpoint,
    )) as Array<{ id: string }>;

    if (existing.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE push_subscriptions
         SET userId = ?, p256dh = ?, auth = ?,
             userAgent = ?, platform = ?, lastSeenAt = CURRENT_TIMESTAMP
         WHERE endpoint = ?`,
        userId,
        input.keys.p256dh,
        input.keys.auth,
        input.userAgent ?? null,
        input.platform ?? null,
        input.endpoint,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO push_subscriptions
          (id, userId, endpoint, p256dh, auth, userAgent, platform,
           createdAt, lastSeenAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        newId('psub'),
        userId,
        input.endpoint,
        input.keys.p256dh,
        input.keys.auth,
        input.userAgent ?? null,
        input.platform ?? null,
      );
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM push_subscriptions WHERE endpoint = ?`,
      input.endpoint,
    )) as DbSub[];
    return toSub(rows[0]);
  }

  async unsubscribePush(userId: string, endpoint: string): Promise<{ ok: true }> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?`,
      userId,
      endpoint,
    );
    return { ok: true };
  }

  async listMyPush(userId: string): Promise<PushSubscription[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM push_subscriptions WHERE userId = ? ORDER BY createdAt DESC`,
      userId,
    )) as DbSub[];
    return rows.map(toSub);
  }

  // ---------- Native Devices (FCM / APNs) ----------

  async registerDevice(
    userId: string,
    input: RegisterDeviceInput,
  ): Promise<UserDevice> {
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM user_devices WHERE platform = ? AND token = ?`,
      input.platform,
      input.token,
    )) as Array<{ id: string }>;

    if (existing.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE user_devices
         SET userId = ?, deviceId = ?, appVersion = ?,
             lastSeenAt = CURRENT_TIMESTAMP
         WHERE platform = ? AND token = ?`,
        userId,
        input.deviceId ?? null,
        input.appVersion ?? null,
        input.platform,
        input.token,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO user_devices
          (id, userId, platform, token, deviceId, appVersion,
           createdAt, lastSeenAt)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        newId('dev'),
        userId,
        input.platform,
        input.token,
        input.deviceId ?? null,
        input.appVersion ?? null,
      );
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM user_devices WHERE platform = ? AND token = ?`,
      input.platform,
      input.token,
    )) as DbDevice[];
    return toDevice(rows[0]);
  }

  async unregisterDevice(userId: string, token: string): Promise<{ ok: true }> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM user_devices WHERE userId = ? AND token = ?`,
      userId,
      token,
    );
    return { ok: true };
  }

  async listMyDevices(userId: string): Promise<UserDevice[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM user_devices WHERE userId = ? ORDER BY createdAt DESC`,
      userId,
    )) as DbDevice[];
    return rows.map(toDevice);
  }

  // ---------- LINE link ----------

  async linkLine(userId: string, input: LinkLineInput): Promise<LineLink> {
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM line_links WHERE userId = ?`,
      userId,
    )) as Array<{ id: string }>;

    if (existing.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE line_links
         SET lineUserId = ?, displayName = ?, pictureUrl = ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE userId = ?`,
        input.lineUserId,
        input.displayName ?? null,
        input.pictureUrl ?? null,
        userId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO line_links
          (id, userId, lineUserId, displayName, pictureUrl,
           createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        newId('ll'),
        userId,
        input.lineUserId,
        input.displayName ?? null,
        input.pictureUrl ?? null,
      );
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM line_links WHERE userId = ?`,
      userId,
    )) as DbLine[];
    return toLine(rows[0]);
  }

  async unlinkLine(userId: string): Promise<{ ok: true }> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM line_links WHERE userId = ?`,
      userId,
    );
    return { ok: true };
  }

  async getLineLink(userId: string): Promise<LineLink | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM line_links WHERE userId = ?`,
      userId,
    )) as DbLine[];
    if (rows.length === 0) return null;
    return toLine(rows[0]);
  }

  // ---------- Preferences (opt-out per channel/topic) ----------

  async listPrefs(userId: string): Promise<NotificationPref[]> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM notification_prefs WHERE userId = ? ORDER BY channel, topic`,
      userId,
    )) as DbPref[];
    return rows.map(toPref);
  }

  async upsertPref(
    userId: string,
    input: UpdateNotificationPrefInput,
  ): Promise<NotificationPref> {
    const topic = input.topic ?? '*';
    const existing = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM notification_prefs
       WHERE userId = ? AND channel = ? AND topic = ?`,
      userId,
      input.channel,
      topic,
    )) as Array<{ id: string }>;

    if (existing.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE notification_prefs
         SET muted = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE userId = ? AND channel = ? AND topic = ?`,
        input.muted ? 1 : 0,
        userId,
        input.channel,
        topic,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notification_prefs
          (id, userId, channel, topic, muted, updatedAt)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        newId('np'),
        userId,
        input.channel,
        topic,
        input.muted ? 1 : 0,
      );
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT * FROM notification_prefs
       WHERE userId = ? AND channel = ? AND topic = ?`,
      userId,
      input.channel,
      topic,
    )) as DbPref[];
    return toPref(rows[0]);
  }
}

function toSub(d: DbSub): PushSubscription {
  return {
    id: d.id,
    userId: d.userId,
    endpoint: d.endpoint,
    p256dh: d.p256dh,
    auth: d.auth,
    userAgent: d.userAgent,
    platform: d.platform,
    createdAt: d.createdAt,
    lastSeenAt: d.lastSeenAt,
  };
}

function toDevice(d: DbDevice): UserDevice {
  return {
    id: d.id,
    userId: d.userId,
    platform: d.platform as UserDevice['platform'],
    token: d.token,
    deviceId: d.deviceId,
    appVersion: d.appVersion,
    createdAt: d.createdAt,
    lastSeenAt: d.lastSeenAt,
  };
}

function toLine(d: DbLine): LineLink {
  return {
    id: d.id,
    userId: d.userId,
    lineUserId: d.lineUserId,
    displayName: d.displayName,
    pictureUrl: d.pictureUrl,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toPref(d: DbPref): NotificationPref {
  return {
    id: d.id,
    userId: d.userId,
    channel: d.channel as NotificationPref['channel'],
    topic: d.topic,
    muted: d.muted === 1,
    updatedAt: d.updatedAt,
  };
}
