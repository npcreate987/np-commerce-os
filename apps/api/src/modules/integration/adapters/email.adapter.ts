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
 * Email adapter — Resend (preferred) or SMTP (Nodemailer fallback).
 *
 * Config priority:
 *   1) EMAIL_PROVIDER=resend + EMAIL_API_KEY    → Resend REST (no SDK needed)
 *   2) EMAIL_PROVIDER=smtp + SMTP_* envs        → Nodemailer (dynamic import)
 *
 * EMAIL_FROM is required either way.
 */
@Injectable()
export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger(EmailAdapter.name);

  private readonly provider = (
    process.env.EMAIL_PROVIDER ?? 'resend'
  ).toLowerCase();
  private readonly apiKey = process.env.EMAIL_API_KEY ?? '';
  private readonly from = process.env.EMAIL_FROM ?? '';
  private readonly smtpHost = process.env.SMTP_HOST ?? '';
  private readonly smtpPort = Number(process.env.SMTP_PORT ?? 587);
  private readonly smtpUser = process.env.SMTP_USER ?? '';
  private readonly smtpPass = process.env.SMTP_PASS ?? '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib
  private smtpTransport: any | null = null;
  private smtpTried = false;

  isReady(): boolean {
    if (!this.from) return false;
    if (this.provider === 'resend') return Boolean(this.apiKey);
    if (this.provider === 'smtp')
      return Boolean(this.smtpHost && this.smtpUser);
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic CJS lib loader
  private async getSmtp(): Promise<any | null> {
    if (this.smtpTried) return this.smtpTransport;
    this.smtpTried = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer');
      this.smtpTransport = nodemailer.createTransport({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpPort === 465,
        auth: { user: this.smtpUser, pass: this.smtpPass },
      });
    } catch (e) {
      this.logger.warn(
        `[email] nodemailer unavailable: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      this.smtpTransport = null;
    }
    return this.smtpTransport;
  }

  async send(
    recipient: AdapterRecipient,
    payload: NotificationPayload,
    _topic: NotificationTopic,
  ): Promise<AdapterResult> {
    const to = recipient.email;
    if (!to) {
      return { status: 'SKIPPED', channel: this.channel, error: 'no-email' };
    }
    if (!this.isReady()) {
      return { status: 'SKIPPED', channel: this.channel, error: 'no-config' };
    }

    const html = renderHtml(payload);
    const text = `${payload.title}\n\n${payload.body}${
      payload.url ? `\n\n${payload.url}` : ''
    }`;

    if (this.provider === 'resend') {
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            from: this.from,
            to,
            subject: payload.title,
            html,
            text,
          }),
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          return {
            status: 'FAIL',
            channel: this.channel,
            error: `resend-${resp.status} ${txt.slice(0, 120)}`,
          };
        }
        const json = (await resp.json().catch(() => ({}))) as { id?: string };
        return {
          status: 'OK',
          channel: this.channel,
          providerMessageId: json.id,
        };
      } catch (e) {
        return {
          status: 'FAIL',
          channel: this.channel,
          error:
            e instanceof Error ? e.message.slice(0, 200) : 'resend-error',
        };
      }
    }

    if (this.provider === 'smtp') {
      const t = await this.getSmtp();
      if (!t) {
        return {
          status: 'SKIPPED',
          channel: this.channel,
          error: 'lib-missing',
        };
      }
      try {
        const info = await t.sendMail({
          from: this.from,
          to,
          subject: payload.title,
          html,
          text,
        });
        return {
          status: 'OK',
          channel: this.channel,
          providerMessageId: info?.messageId,
        };
      } catch (e) {
        return {
          status: 'FAIL',
          channel: this.channel,
          error: e instanceof Error ? e.message.slice(0, 200) : 'smtp-error',
        };
      }
    }

    return {
      status: 'SKIPPED',
      channel: this.channel,
      error: 'unknown-provider',
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderHtml(payload: NotificationPayload): string {
  const cta = payload.url
    ? `<p style="margin:24px 0;">
         <a href="${escapeHtml(payload.url)}"
            style="background:#111;color:#fff;padding:12px 20px;
                   border-radius:8px;text-decoration:none;">
           เปิดดู →
         </a>
       </p>`
    : '';
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,
  Helvetica,Arial,sans-serif;line-height:1.6;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="font-size:20px;margin:0 0 12px;">${escapeHtml(payload.title)}</h2>
  <p style="margin:0 0 16px;">${escapeHtml(payload.body).replaceAll('\n', '<br/>')}</p>
  ${cta}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/>
  <p style="font-size:12px;color:#888;margin:0;">
    NP Commerce · ส่งจากระบบอัตโนมัติ
  </p>
</body></html>`;
}
