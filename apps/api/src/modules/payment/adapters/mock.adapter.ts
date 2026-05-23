import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  CreateChargeInput,
  CreateChargeResult,
  PaymentAdapter,
  WebhookEvent,
} from './types';

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
    return {
      provider: this.id,
      providerRef,
      qrCodePayload:
        input.method === 'PROMPTPAY'
          ? `00020101021229370016A000000677010111011300668000000005802TH53037645406${(input.amountCents / 100).toFixed(2)}6304ABCD`
          : null,
    };
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
