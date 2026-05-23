import { Injectable } from '@nestjs/common';
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

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Existing behaviour from Phase 5 — writes a row to `inapp_messages` so the
 * customer sees a bubble in `/inbox`. Always ready (no external config).
 *
 * Carries the `broadcastId` via payload.data.broadcastId when present so the
 * inbox UI can deep-link to the originating campaign.
 */
@Injectable()
export class InAppAdapter implements ChannelAdapter {
  readonly channel = 'INAPP' as const;

  constructor(private readonly prisma: PrismaService) {}

  isReady(): boolean {
    return true;
  }

  async send(
    recipient: AdapterRecipient,
    payload: NotificationPayload,
    _topic: NotificationTopic,
  ): Promise<AdapterResult> {
    const broadcastId = payload.data?.broadcastId ?? null;
    const cta = payload.url ? { url: payload.url } : {};
    try {
      const id = newId('msg');
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO inapp_messages
          (id, userId, broadcastId, title, body, ctaJson, read, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
        id,
        recipient.userId,
        broadcastId,
        payload.title,
        payload.body,
        JSON.stringify(cta),
      );
      return { status: 'OK', channel: this.channel, providerMessageId: id };
    } catch (e) {
      return {
        status: 'FAIL',
        channel: this.channel,
        error: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
      };
    }
  }
}
