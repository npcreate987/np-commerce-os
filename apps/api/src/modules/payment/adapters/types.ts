/**
 * Phase 13.4 — Payment adapter contract.
 *
 * Why an adapter abstraction?
 *   • We must keep the legacy mock running for dev/CI while real Omise rolls
 *     out via env keys. Same controller, two backends.
 *   • Future gateways (2C2P, Stripe, KBank API) can drop in without touching
 *     `PaymentService` or controllers.
 *
 * Lifecycle
 *   1. `createCharge(...)` — invoked from `POST /v1/payments` when a user
 *     starts paying for an order. Adapter returns the artefacts the FE needs
 *     to show a QR (PromptPay) or redirect/card-form (Card).
 *   2. `verifyWebhook(...)` — invoked from `POST /v1/payments/webhook/<vendor>`
 *     to authenticate the inbound callback and turn the raw payload into a
 *     normalised `WebhookEvent`. PaymentService then settles the order/wallet.
 *
 * Errors
 *   • Adapters throw `BadRequestException` for caller mistakes (unsupported
 *     method, malformed body, bad signature) so they surface as 400 to the
 *     client/webhook source.
 *   • Network/upstream failures propagate raw — the global exception filter
 *     catches them as 500 and reports to Sentry.
 */

export interface CreateChargeInput {
  orderId: string;
  method: 'PROMPTPAY' | 'CARD' | 'COD';
  amountCents: number;
  /** Optional email for receipt — Omise can use it for fraud signals. */
  customerEmail?: string | null;
}

export interface CreateChargeResult {
  /** `mock`, `omise`, etc. — recorded on the Payment row so we know who owns settlement. */
  provider: string;
  /** Provider's primary identifier (Omise charge id `chrg_xxx`, etc.). */
  providerRef: string;
  /**
   * Encoded EMVCo string for PromptPay QR. Mock provider returns a static
   * dummy; Omise returns the real string from `source.scannable_code.image.uri`
   * decoded to text (or a CDN URL the FE renders directly — see Omise docs).
   */
  qrCodePayload: string | null;
  /** ISO timestamp when this charge expires, if the provider exposes one. */
  expiresAt?: string;
}

export interface WebhookEvent {
  /** Provider that produced the event (mock/omise/…) — equals adapter.id. */
  provider: string;
  /** Provider event id; deduped against `payment_webhook_events.providerEventId`. */
  eventId: string;
  /** Normalised internal state. */
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  /** Provider charge identifier — used to look up the matching `payments` row. */
  providerRef: string;
  /** Amount in subunits (satang for THB). May be 0 for status-only events. */
  amountCents: number;
  /** Optional failure reason text, surfaced to merchant CS dashboard. */
  failureMessage?: string;
}

/**
 * Adapter interface. Implementations live in `./*.adapter.ts`.
 */
export interface PaymentAdapter {
  /** Stable id used in DB rows + log lines. */
  readonly id: string;

  /**
   * Whether this adapter has the keys/config it needs. PaymentService uses
   * this to fall back to the mock adapter when production keys are absent.
   */
  isReady(): boolean;

  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;

  /**
   * Verify the inbound webhook signature & normalise. Returns `null` when the
   * payload is technically valid but not interesting to us (e.g. an unrelated
   * event topic).
   *
   * `rawBody` is the *exact* bytes the provider sent — never re-stringify or
   * the HMAC will mismatch.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent | null>;
}
