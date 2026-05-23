/**
 * Phase 9 runtime migration — Real Notifications & Delivery Channels
 *
 * Tables:
 *   - push_subscriptions       (Web Push / VAPID)
 *   - user_devices             (FCM / APNs tokens จาก Capacitor)
 *   - line_links               (จับคู่ NP userId ↔ lineUserId)
 *   - notification_prefs       (opt-in / opt-out รายช่อง)
 *   - notification_logs        (audit + AI Ops + retry)
 *
 * Idempotent: ใช้ CREATE TABLE IF NOT EXISTS
 */

import { PrismaClient } from '@prisma/client';

const SCHEMA = [
  // ----- Web Push subscriptions -----
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    userAgent TEXT,
    platform TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(userId)`,

  // ----- FCM / APNs (native Capacitor) -----
  `CREATE TABLE IF NOT EXISTS user_devices (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    platform TEXT NOT NULL,
    token TEXT NOT NULL,
    deviceId TEXT,
    appVersion TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, token)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(userId)`,

  // ----- LINE account linking -----
  `CREATE TABLE IF NOT EXISTS line_links (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL UNIQUE,
    lineUserId TEXT NOT NULL UNIQUE,
    displayName TEXT,
    pictureUrl TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // ----- Per-user channel preferences -----
  //   muted = explicit OFF; absence of row = default ON (opt-out model)
  `CREATE TABLE IF NOT EXISTS notification_prefs (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    channel TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '*',
    muted INTEGER NOT NULL DEFAULT 0,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(userId, channel, topic)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notif_prefs_user
    ON notification_prefs(userId)`,

  // ----- Delivery log (audit / AI Ops / retry) -----
  `CREATE TABLE IF NOT EXISTS notification_logs (
    id TEXT PRIMARY KEY,
    broadcastId TEXT,
    userId TEXT NOT NULL,
    channel TEXT NOT NULL,
    topic TEXT,
    status TEXT NOT NULL DEFAULT 'OK',
    error TEXT,
    providerMessageId TEXT,
    durationMs INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notif_logs_broadcast
    ON notification_logs(broadcastId)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_logs_user_created
    ON notification_logs(userId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_logs_channel_status
    ON notification_logs(channel, status, createdAt)`,
];

export async function runPhase9Migration(prisma: PrismaClient): Promise<void> {
  for (const ddl of SCHEMA) {
    await prisma.$executeRawUnsafe(ddl);
  }
  // eslint-disable-next-line no-console
  console.log('[bootstrap-phase9] migration complete');
}
