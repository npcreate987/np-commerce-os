import { Injectable, Logger } from '@nestjs/common';
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
 * LINE Messaging API adapter.
 *
 * Two delivery modes:
 *   1) `LINE_ACCESS_TOKEN` (Messaging API channel access token) → push messages
 *      to individual users via /v2/bot/message/push (requires user to have
 *      added the OA as a friend AND we know their `lineUserId`).
 *   2) `LINE_NOTIFY_TOKEN` (LINE Notify per-user token) → /api/notify
 *      (fallback when Messaging API isn't available; user-specific token must
 *      be stored elsewhere — not handled here).
 *
 * Send-time fallback: if no token / no lineUserId → SKIPPED.
 */
@Injectable()
export class LineAdapter implements ChannelAdapter {
  readonly channel = 'LINE' as const;
  private readonly logger = new Logger(LineAdapter.name);

  private readonly accessToken = process.env.LINE_ACCESS_TOKEN ?? '';
  // LINE_CHANNEL_SECRET reserved for incoming webhook verification (Phase 9.3)

  isReady(): boolean {
    return Boolean(this.accessToken);
  }

  async send(
    recipient: AdapterRecipient,
    payload: NotificationPayload,
    _topic: NotificationTopic,
  ): Promise<AdapterResult> {
    if (!this.isReady()) {
      return { status: 'SKIPPED', channel: this.channel, error: 'no-token' };
    }
    const to = recipient.lineUserId;
    if (!to) {
      return {
        status: 'SKIPPED',
        channel: this.channel,
        error: 'not-linked',
      };
    }

    const messages: unknown[] = [
      {
        type: 'text',
        text: `${payload.title}\n${payload.body}${
          payload.url ? `\n${payload.url}` : ''
        }`,
      },
    ];

    try {
      const resp = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ to, messages }),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        return {
          status: 'FAIL',
          channel: this.channel,
          error: `line-${resp.status} ${txt.slice(0, 120)}`,
        };
      }
      const reqId = resp.headers.get('x-line-request-id') ?? undefined;
      return {
        status: 'OK',
        channel: this.channel,
        providerMessageId: reqId ?? undefined,
      };
    } catch (e) {
      this.logger.warn(
        `[line] send failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        status: 'FAIL',
        channel: this.channel,
        error: e instanceof Error ? e.message.slice(0, 200) : 'line-error',
      };
    }
  }
}
