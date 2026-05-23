import {
  NotificationChannel,
  NotificationPayload,
  NotificationTopic,
} from '../../../shared/types';

/**
 * Single delivery result coming back from an adapter.
 *
 * - status `OK`     → delivered (or queued at provider) successfully
 * - status `FAIL`   → provider returned an error; `error` filled
 * - status `SKIPPED`→ adapter had nothing to send (no token, opted out, etc.)
 */
export interface AdapterResult {
  status: 'OK' | 'FAIL' | 'SKIPPED';
  channel: NotificationChannel;
  error?: string;
  providerMessageId?: string;
}

export interface AdapterRecipient {
  userId: string;
  /** Web Push subscriptions (Web Push adapter only) */
  webPush?: Array<{ endpoint: string; p256dh: string; auth: string }>;
  /** Native push tokens (FCM/APNs) */
  fcmTokens?: string[];
  apnsTokens?: string[];
  /** Channel destinations */
  email?: string | null;
  lineUserId?: string | null;
}

export interface ChannelAdapter {
  readonly channel: NotificationChannel;
  /** Returns true when env/config makes this adapter ready to fire. */
  isReady(): boolean;
  send(
    recipient: AdapterRecipient,
    payload: NotificationPayload,
    topic: NotificationTopic,
  ): Promise<AdapterResult>;
}
