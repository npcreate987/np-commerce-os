import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  CreateChargeInput,
  CreateChargeResult,
  PaymentAdapter,
  WebhookEvent,
} from './types';
import {
  buildPromptPayPayload,
  type PromptPayTarget,
} from '../../../common/promptpay/emv';

/**
 * Phase 13.4 — Mock payment adapter.
 *
 * Preserves the legacy Phase-1 behaviour: returns a fake EMVCo-ish PromptPay
 * string and a synthetic charge id. The matching webhook entry point is the
 * existing `POST /v1/payments/mock/confirm/:orderId` route in PaymentController
 * (the controller invokes `PaymentService.settle(...)` directly rather than
 * round-tripping through the verifyWebhook contract — kept that way to avoid
 * disturbing existing tests/E2E flows).
 *
 * `verifyWebhook` is also implemented so a debug client can POST a payload to
 * `/v1/payments/webhook/mock` and trigger settlement — handy for staging
 * smoke-tests of the real webhook flow without an Omise account.
 */
export class MockPaymentAdapter implements PaymentAdapter {
  readonly id = 'mock';

  isReady(): boolean {
    return true; // Mock is always ready — it's the dev/CI fallback.
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    if (input.amountCents <= 0) {
      throw new BadRequestException('Invalid amount');
    }
    const providerRef = `mock_${randomBytes(8).toString('hex')}`;

    let qrCodePayload: string | null = null;
    if (input.method === 'PROMPTPAY') {
      // Phase 20.1 — if the env exposes a real PromptPay identifier, generate
      // a spec-compliant EMVCo QR that ANY bank app can actually scan. This
      // lets dev/staging see a working QR even without Omise. In production
      // you'd set OMISE_SECRET_KEY → the Omise adapter takes over via auto.
      const target = resolvePromptPayTarget();
      qrCodePayload = buildPromptPayPayload({
        target,
        amount: Math.round(input.amountCents) / 100,
      });
    }
    return { provider: this.id, providerRef, qrCodePayload };
  }

  async verifyWebhook(
    rawBody: string,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent | null> {
    // Mock contract: caller POSTs JSON `{ providerRef, status, amountCents }`.
    // No signature check — staging-only.
    try {
      const parsed = JSON.parse(rawBody) as {
        providerRef?: string;
        status?: 'SUCCEEDED' | 'FAILED';
        amountCents?: number;
        eventId?: string;
      };
      if (!parsed.providerRef || !parsed.status) return null;
      return {
        provider: this.id,
        eventId: parsed.eventId ?? `mock_evt_${Date.now()}`,
        status: parsed.status,
        providerRef: parsed.providerRef,
        amountCents: Number(parsed.amountCents ?? 0),
      };
    } catch {
      return null;
    }
  }
}

/**
 * Resolve the merchant PromptPay target from the environment.
 *
 *   PROMPTPAY_TARGET     "phone:0812345678" | "nid:1234567890123" | "ewallet:004999900000000"
 *
 * Falls back to a syntactically-valid demo phone (`0066000000000`) when
 * unset — that QR will *not* actually settle funds (the number isn't
 * registered with PromptPay) but it WILL scan and demonstrate the flow
 * end-to-end on dev devices without leaking a real phone number into git.
 */
function resolvePromptPayTarget(): PromptPayTarget {
  const raw = (process.env.PROMPTPAY_TARGET ?? '').trim();
  if (!raw) {
    return { kind: 'phone', value: '0800000000' };
  }
  const sep = raw.indexOf(':');
  if (sep <= 0) {
    // Bare number → assume phone for convenience.
    return { kind: 'phone', value: raw };
  }
  const kind = raw.slice(0, sep).toLowerCase();
  const value = raw.slice(sep + 1);
  if (kind === 'phone' || kind === 'nid' || kind === 'ewallet') {
    return { kind, value };
  }
  throw new BadRequestException(
    `PROMPTPAY_TARGET must be one of phone:* / nid:* / ewallet:* (got "${kind}")`,
  );
}
