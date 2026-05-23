import { BadRequestException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CreateChargeInput,
  CreateChargeResult,
  PaymentAdapter,
  WebhookEvent,
} from './types';

/**
 * Phase 13.4 — Cloud Omise adapter (Opn / Omise REST v2017-11-02).
 *
 * Env vars
 *   OMISE_PUBLIC_KEY     pkey_test_… or pkey_live_… (currently unused server-side;
 *                        kept around so the FE can read it via `/v1/payments/config`)
 *   OMISE_SECRET_KEY     skey_test_… or skey_live_… (REQUIRED for charge creation)
 *   OMISE_WEBHOOK_SECRET 32-byte hex shared with the Omise dashboard webhook
 *
 * Wire format
 *   • https://api.omise.co/sources   — create a PromptPay source
 *   • https://api.omise.co/charges   — capture the source into a charge
 *   • Webhooks                       — POST JSON envelope `{ id, object:'event', key:'charge.complete', data:{ object:'charge', … } }`
 *                                       Signature header: `x-omise-signature: <hex hmac sha256 of raw body>`
 *
 * Network calls use the global `fetch` (Node 18+). We deliberately avoid the
 * `omise` npm SDK to minimise dependency surface — the surface area we use is
 * tiny and the typings would be more boilerplate than helper.
 */

const OMISE_BASE = 'https://api.omise.co';

interface OmiseError {
  object: 'error';
  location: string;
  code: string;
  message: string;
}

interface OmiseSource {
  object: 'source';
  id: string;
  type: string;
  scannable_code?: { image?: { download_uri?: string } };
}

interface OmiseCharge {
  object: 'charge';
  id: string;
  amount: number; // satang
  currency: string;
  status: 'pending' | 'successful' | 'failed' | 'expired' | 'reversed';
  failure_code?: string | null;
  failure_message?: string | null;
  source?: OmiseSource;
}

interface OmiseWebhookEnvelope {
  object: 'event';
  id: string;
  key: string;
  data: OmiseCharge | { object: string; [k: string]: unknown };
}

export class OmisePaymentAdapter implements PaymentAdapter {
  readonly id = 'omise';
  private readonly logger = new Logger(OmisePaymentAdapter.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor() {
    this.secretKey = (process.env.OMISE_SECRET_KEY ?? '').trim();
    this.webhookSecret = (process.env.OMISE_WEBHOOK_SECRET ?? '').trim();
  }

  isReady(): boolean {
    return this.secretKey.length > 0;
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    if (!this.isReady()) {
      throw new BadRequestException('OMISE_SECRET_KEY not configured');
    }

    if (input.method !== 'PROMPTPAY') {
      // Card / COD flows are future Phase 13.4 work — fail loud so we don't
      // silently fall back to mock for unsupported real-world methods.
      throw new BadRequestException(
        `OmiseAdapter currently only supports PROMPTPAY (got ${input.method})`,
      );
    }

    // 1) Create a source (PromptPay) — Omise will return a scannable_code QR.
    const sourceForm = new URLSearchParams({
      type: 'promptpay',
      amount: String(input.amountCents),
      currency: 'thb',
    });
    const source = await this.post<OmiseSource>('/sources', sourceForm);

    // 2) Capture the source into a charge.
    const chargeForm = new URLSearchParams({
      amount: String(input.amountCents),
      currency: 'thb',
      source: source.id,
      // Metadata.order_id lets us correlate webhooks back to our `orders.id`
      // even if the Omise charge id is lost in transit.
      'metadata[order_id]': input.orderId,
    });
    if (input.customerEmail) {
      chargeForm.append('metadata[email]', input.customerEmail);
    }
    const charge = await this.post<OmiseCharge>('/charges', chargeForm);

    // Omise returns the PromptPay QR as a downloadable PNG URI on
    // `source.scannable_code.image.download_uri`. We hand that back as the
    // FE's qrCodePayload — the existing checkout page renders it as an
    // <img/> if the string looks like a URL, else as raw EMVCo text.
    const qrCodePayload =
      charge.source?.scannable_code?.image?.download_uri ??
      source.scannable_code?.image?.download_uri ??
      null;

    return {
      provider: this.id,
      providerRef: charge.id,
      qrCodePayload,
    };
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent | null> {
    if (!this.webhookSecret) {
      // Defensive: refuse to process if signing secret missing in prod-style env.
      throw new BadRequestException('OMISE_WEBHOOK_SECRET not configured');
    }
    const provided = pickHeader(headers, 'x-omise-signature');
    if (!provided) {
      throw new BadRequestException('Missing x-omise-signature header');
    }
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    // Constant-time comparison defeats timing side channels.
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let env: OmiseWebhookEnvelope;
    try {
      env = JSON.parse(rawBody) as OmiseWebhookEnvelope;
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }
    if (env.object !== 'event' || !env.key || !env.data) return null;
    if (!env.key.startsWith('charge.')) {
      // We only care about charge.* events for now (capture, complete, refund).
      return null;
    }
    const data = env.data as OmiseCharge;
    if (data.object !== 'charge') return null;

    const status: WebhookEvent['status'] =
      data.status === 'successful'
        ? 'SUCCEEDED'
        : data.status === 'failed' || data.status === 'expired'
          ? 'FAILED'
          : 'PENDING';
    return {
      provider: this.id,
      eventId: env.id,
      status,
      providerRef: data.id,
      amountCents: data.amount,
      failureMessage: data.failure_message ?? undefined,
    };
  }

  // ------------------------------------------------------------------
  // HTTP helpers
  // ------------------------------------------------------------------
  private async post<T>(path: string, form: URLSearchParams): Promise<T> {
    const url = `${OMISE_BASE}${path}`;
    const auth = Buffer.from(`${this.secretKey}:`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    });
    const text = await res.text();
    let body: T | OmiseError;
    try {
      body = JSON.parse(text);
    } catch {
      this.logger.error(`Omise ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 500)}`);
      throw new BadRequestException(`Omise upstream error (HTTP ${res.status})`);
    }
    if (!res.ok) {
      const err = body as OmiseError;
      this.logger.warn(`Omise ${path} ${res.status} ${err.code}: ${err.message}`);
      throw new BadRequestException(
        err?.message ?? `Omise upstream error (HTTP ${res.status})`,
      );
    }
    return body as T;
  }
}

function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}
