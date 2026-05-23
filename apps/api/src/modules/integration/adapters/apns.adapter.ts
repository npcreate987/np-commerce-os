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
 * Native APNs adapter — direct (no Firebase).
 *
 * Config:
 *   APNS_KEY_PATH        = path to APNs .p8 file
 *   APNS_KEY_ID          = key id
 *   APNS_TEAM_ID         = team id
 *   APNS_TOPIC           = bundle id (e.g. app.np.commerce)
 *   APNS_PRODUCTION=true (defaults to false / sandbox)
 *
 * Most projects on Capacitor + Firebase will route APNs through the
 * `FcmAdapter` instead — this is the "no FCM" fallback. When neither
 * APNS_KEY_PATH nor APNS_KEY_BASE64 is set, every send is SKIPPED so
 * Firebase remains the primary path.
 */
@Injectable()
export class ApnsAdapter implements ChannelAdapter {
  readonly channel = 'APNS' as const;
  private readonly logger = new Logger(ApnsAdapter.name);

  private readonly keyPath = process.env.APNS_KEY_PATH ?? '';
  private readonly keyBase64 = process.env.APNS_KEY_BASE64 ?? '';
  private readonly keyId = process.env.APNS_KEY_ID ?? '';
  private readonly teamId = process.env.APNS_TEAM_ID ?? '';
  private readonly bundleId = process.env.APNS_TOPIC ?? '';
  private readonly production = process.env.APNS_PRODUCTION === 'true';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib
  private provider: any | null = null;
  private tried = false;

  isReady(): boolean {
    return Boolean(
      (this.keyPath || this.keyBase64) &&
        this.keyId &&
        this.teamId &&
        this.bundleId,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib loader
  private async load(): Promise<any | null> {
    if (this.tried) return this.provider;
    this.tried = true;
    if (!this.isReady()) {
      this.provider = null;
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const apn = require('apn');
      const token = this.keyBase64
        ? {
            key: Buffer.from(this.keyBase64, 'base64'),
            keyId: this.keyId,
            teamId: this.teamId,
          }
        : {
            key: this.keyPath,
            keyId: this.keyId,
            teamId: this.teamId,
          };
      this.provider = new apn.Provider({
        token,
        production: this.production,
      });
    } catch (e) {
      this.logger.warn(
        `[apns] dep unavailable: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      this.provider = null;
    }
    return this.provider;
  }

  async send(
    recipient: AdapterRecipient,
    payload: NotificationPayload,
    _topic: NotificationTopic,
  ): Promise<AdapterResult> {
    const tokens = recipient.apnsTokens ?? [];
    if (tokens.length === 0) {
      return {
        status: 'SKIPPED',
        channel: this.channel,
        error: 'no-token',
      };
    }
    if (!this.isReady()) {
      return {
        status: 'SKIPPED',
        channel: this.channel,
        error: 'no-config',
      };
    }
    const provider = await this.load();
    if (!provider) {
      return {
        status: 'SKIPPED',
        channel: this.channel,
        error: 'lib-missing',
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const apn = require('apn');
      const note = new apn.Notification();
      note.alert = { title: payload.title, body: payload.body };
      note.topic = this.bundleId;
      note.sound = 'default';
      note.payload = {
        url: payload.url ?? '/',
        tag: payload.tag ?? 'np',
        ...(payload.data ?? {}),
      };
      const result = await provider.send(note, tokens);
      const sent = (result?.sent?.length ?? 0) > 0;
      return sent
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
        error: e instanceof Error ? e.message.slice(0, 200) : 'apns-error',
      };
    }
  }
}
