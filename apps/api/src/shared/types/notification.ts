import { z } from 'zod';

// =============================================================================
// Channels & delivery primitives (Phase 9)
// =============================================================================

export const notificationChannelSchema = z.enum([
  'INAPP',
  'WEB_PUSH',
  'FCM',
  'APNS',
  'EMAIL',
  'LINE',
]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationTopicSchema = z.enum([
  'TRANSACTIONAL',
  'PROMOTIONAL',
  'REVIEW_REMINDER',
  'CS_REPLY',
  'SYSTEM',
]);
export type NotificationTopic = z.infer<typeof notificationTopicSchema>;

// =============================================================================
// Push Subscription (Web Push / VAPID)
// =============================================================================

export const pushSubscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  userAgent: z.string().nullable(),
  platform: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});
export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;

export const subscribePushInputSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
  platform: z.string().optional(),
});
export type SubscribePushInput = z.infer<typeof subscribePushInputSchema>;

// =============================================================================
// Native Device Token (FCM / APNs)
// =============================================================================

export const devicePlatformSchema = z.enum(['ios', 'android', 'web']);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const userDeviceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  platform: devicePlatformSchema,
  token: z.string(),
  deviceId: z.string().nullable(),
  appVersion: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});
export type UserDevice = z.infer<typeof userDeviceSchema>;

export const registerDeviceInputSchema = z.object({
  platform: devicePlatformSchema,
  token: z.string().min(8),
  deviceId: z.string().optional(),
  appVersion: z.string().optional(),
});
export type RegisterDeviceInput = z.infer<typeof registerDeviceInputSchema>;

// =============================================================================
// LINE Linking
// =============================================================================

export const lineLinkSchema = z.object({
  id: z.string(),
  userId: z.string(),
  lineUserId: z.string(),
  displayName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LineLink = z.infer<typeof lineLinkSchema>;

export const linkLineInputSchema = z.object({
  lineUserId: z.string().min(1),
  displayName: z.string().optional(),
  pictureUrl: z.string().url().optional(),
});
export type LinkLineInput = z.infer<typeof linkLineInputSchema>;

// =============================================================================
// Notification preferences
// =============================================================================

export const notificationPrefSchema = z.object({
  id: z.string(),
  userId: z.string(),
  channel: notificationChannelSchema,
  topic: z.string(),
  muted: z.boolean(),
  updatedAt: z.string(),
});
export type NotificationPref = z.infer<typeof notificationPrefSchema>;

export const updateNotificationPrefInputSchema = z.object({
  channel: notificationChannelSchema,
  topic: z.string().default('*'),
  muted: z.boolean(),
});
export type UpdateNotificationPrefInput = z.infer<
  typeof updateNotificationPrefInputSchema
>;

// =============================================================================
// Delivery log
// =============================================================================

export const notificationStatusSchema = z.enum(['OK', 'FAIL', 'SKIPPED']);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const notificationLogSchema = z.object({
  id: z.string(),
  broadcastId: z.string().nullable(),
  userId: z.string(),
  channel: notificationChannelSchema,
  topic: z.string().nullable(),
  status: notificationStatusSchema,
  error: z.string().nullable(),
  providerMessageId: z.string().nullable(),
  durationMs: z.number().int(),
  createdAt: z.string(),
});
export type NotificationLog = z.infer<typeof notificationLogSchema>;

// =============================================================================
// Outbound payload
// =============================================================================

export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

// =============================================================================
// Public config
// =============================================================================

export const notificationConfigSchema = z.object({
  webPushEnabled: z.boolean(),
  vapidPublicKey: z.string().nullable(),
  fcmEnabled: z.boolean(),
  apnsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  lineEnabled: z.boolean(),
  lineLiffId: z.string().nullable(),
});
export type NotificationConfig = z.infer<typeof notificationConfigSchema>;
