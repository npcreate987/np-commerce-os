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
 * Web Push adapter (RFC 8030, VAPID).
 *
 * `web-push` is required at runtime via dynamic import so the module compiles
 * + boots cleanly when the dep isn't installed (dev environments, CI on
 * branches that don't ship this feature, etc.). When VAPID keys are absent
 * the adapter reports `isReady === false` and every send returns SKIPPED.
 *
 * Stale subscriptions (`410 Gone`, `404 Not Found`) are deleted automatically
 * to keep the table from growing unbounded.
 */
@Injectable()
export class WebPushAdapter implements ChannelAdapter {
  readonly channel = 'WEB_PUSH' as const;
  private readonly logger = new Logger(WebPushAdapter.name);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib
  private lib: any | null = null;
  private libLoaded = false;
  private readonly publicKey = process.env.WEB_PUSH_VAPID_PUBLIC ?? '';
  private readonly privateKey = process.env.WEB_PUSH_VAPID_PRIVATE ?? '';
  private readonly subject =
    process.env.WEB_PUSH_VAPID_SUBJECT ??
    process.env.EMAIL_FROM ??
    'mailto:no-reply@np-commerce.com';

  constructor(private readonly prisma: PrismaService) {}

  isReady(): boolean {
    return Boolean(this.publicKey && this.privateKey);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional dynamic CJS lib loader
  private async loadLib(): Promise<any | null> {
    if (this.libLoaded) return this.lib;
    this.libLoaded = true;
    try {
      // Resolve at runtime so missing dep doesn't break tsc/boot
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const mod = require('web-push');
      this.lib = mod?.default ?? mod;
      if (this.lib?.setVapidDetails) {
        this.lib.setVapidDetails(this.subject, this.publicKey, this.privateKey);
      }
    } catch {
      this.logger.warn(
        '[web-push] dep not installed — WEB_PUSH channel will be SKIPPED',
      );
      this.lib = null;
    }
    return this.lib;
  }

  async send(
    recipient: AdapterRecipient,
    payload: NotificationPayload,
    _topic: NotificationTopic,
  ): Promise<AdapterResult> {
    if (!this.isReady()) {
      return { status: 'SKIPPED', channel: this.channel, error: 'no-vapid' };
    }
    const subs = recipient.webPush ?? [];
    if (subs.length === 0) {
      return {
        status: 'SKIPPED',
        channel: this.channel,
        error: 'no-subscription',
      };
    }
    const lib = await this.loadLib();
    if (!lib?.sendNotification) {
      return {
        status: 'SKIPPED',
        channel: this.channel,
        error: 'lib-missing',
      };
    }

    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag ?? 'np',
      imageUrl: payload.imageUrl,
      data: payload.data ?? {},
    });

    let ok = false;
    let lastError: string | undefined;
    let lastId: string | undefined;

    for (const s of subs) {
      try {
        const res = await lib.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          data,
          { TTL: 60 * 60 },
        );
        ok = true;
        lastId = res?.headers?.['x-message-id'] ?? undefined;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription dead — purge so we don't keep retrying
          try {
            await this.prisma.$executeRawUnsafe(
              `DELETE FROM push_subscriptions WHERE endpoint = ?`,
              s.endpoint,
            );
          } catch {
            // ignore best-effort cleanup
          }
          lastError = `gone-${code}`;
        } else {
          lastError =
            err instanceof Error ? err.message.slice(0, 200) : 'web-push-error';
        }
      }
    }

    if (ok) {
      return {
        status: 'OK',
        channel: this.channel,
        providerMessageId: lastId,
      };
    }
    return {
      status: 'FAIL',
      channel: this.channel,
      error: lastError ?? 'no-delivery',
    };
  }
}
