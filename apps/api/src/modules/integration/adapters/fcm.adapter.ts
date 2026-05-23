import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  NotificationPayload,
  NotificationTopic,
} from '../../../shared/types';
import {
  AdapterRecipient,
  AdapterResult,
  ChannelAdapter,
} from './types';

/**
 * FCM adapter — handles BOTH Android (FCM) and iOS (APNs via FCM).
 *
 * Two configuration paths:
 *  1) Modern: GOOGLE_APPLICATION_CREDENTIALS or
 *     FCM_SERVICE_ACCOUNT_JSON (raw service-account JSON, single-line) →
 *     uses firebase-admin SDK (dynamic import).
 *  2) Legacy: FCM_SERVER_KEY → calls https://fcm.googleapis.com/fcm/send.
 *
 * APNs tokens are also forwarded via FCM when registered with platform = 'ios'
 * (this is the standard pattern when using Capacitor + Firebase plugin).
 */
@Injectable()
export class FcmAdapter implements ChannelAdapter {
  readonly channel = 'FCM' as const;
  private readonly logger = new Logger(FcmAdapter.name);

  private readonly legacyKey = process.env.FCM_SERVER_KEY ?? '';
  private readonly saJson = process.env.FCM_SERVICE_ACCOUNT_JSON ?? '';
  private readonly saPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib
  private admin: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib
  private app: any | null = null;
  private adminTried = false;

  constructor(private readonly prisma: PrismaService) {}

  isReady(): boolean {
    return Boolean(this.legacyKey || this.saJson || this.saPath);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib loader
  private async loadAdmin(): Promise<any | null> {
    if (this.adminTried) return this.admin;
    this.adminTried = true;
    if (!this.saJson && !this.saPath) {
      this.admin = null;
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const mod = require('firebase-admin');
      this.admin = mod?.default ?? mod;
      const creds = this.saJson
        ? JSON.parse(this.saJson)
        : require(this.saPath);
      this.app = this.admin.initializeApp({
        credential: this.admin.credential.cert(creds),
      });
    } catch (e) {
      this.logger.warn(
        `[fcm] firebase-admin unavailable: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      this.admin = null;
    }
    return this.admin;
  }

  async send(
    recipient: AdapterRecipient,
    payload: NotificationPayload,
    _topic: NotificationTopic,
  ): Promise<AdapterResult> {
    const tokens = [
      ...(recipient.fcmTokens ?? []),
      ...(recipient.apnsTokens ?? []),
    ];
    if (tokens.length === 0) {
      return {
        status: 'SKIPPED',
        channel: this.channel,
        error: 'no-token',
      };
    }
    if (!this.isReady()) {
      return { status: 'SKIPPED', channel: this.channel, error: 'no-config' };
    }

    const admin = await this.loadAdmin();
    if (admin?.messaging) {
      try {
        const res = await admin.messaging(this.app).sendEachForMulticast({
          tokens,
          notification: {
            title: payload.title,
            body: payload.body,
            imageUrl: payload.imageUrl,
          },
          data: {
            url: payload.url ?? '/',
            tag: payload.tag ?? 'np',
            ...(payload.data ?? {}),
          },
        });
        const okCount = res?.successCount ?? 0;
        // Purge invalid tokens
        const responses = (res?.responses ?? []) as Array<{
          success: boolean;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error?: any;
        }>;
        for (let i = 0; i < responses.length; i++) {
          const r = responses[i];
          if (
            !r.success &&
            typeof r.error?.code === 'string' &&
            r.error.code.includes('registration-token-not-registered')
          ) {
            try {
              await this.prisma.$executeRawUnsafe(
                `DELETE FROM user_devices WHERE token = ?`,
                tokens[i],
              );
            } catch {
              // best-effort
            }
          }
        }
        return okCount > 0
          ? { status: 'OK', channel: this.channel }
          : {
              status: 'FAIL',
              channel: this.channel,
              error: 'all-failed',
            };
      } catch (e) {
        return {
          status: 'FAIL',
          channel: this.channel,
          error: e instanceof Error ? e.message.slice(0, 200) : 'fcm-error',
        };
      }
    }

    // Legacy HTTP path
    if (this.legacyKey) {
      let ok = false;
      let lastErr: string | undefined;
      for (const token of tokens) {
        try {
          const resp = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `key=${this.legacyKey}`,
            },
            body: JSON.stringify({
              to: token,
              notification: {
                title: payload.title,
                body: payload.body,
                image: payload.imageUrl,
              },
              data: {
                url: payload.url ?? '/',
                tag: payload.tag ?? 'np',
                ...(payload.data ?? {}),
              },
            }),
          });
          if (resp.ok) {
            ok = true;
          } else {
            lastErr = `http-${resp.status}`;
          }
        } catch (e) {
          lastErr =
            e instanceof Error ? e.message.slice(0, 200) : 'fcm-http-error';
        }
      }
      return ok
        ? { status: 'OK', channel: this.channel }
        : {
            status: 'FAIL',
            channel: this.channel,
            error: lastErr ?? 'no-delivery',
          };
    }

    return { status: 'SKIPPED', channel: this.channel, error: 'no-driver' };
  }
}
