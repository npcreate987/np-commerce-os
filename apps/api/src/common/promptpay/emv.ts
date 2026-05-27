/**
 * Phase 20.1 — Thai PromptPay EMVCo QR payload builder.
 *
 * Reference
 * ---------
 * The Thai Bankers Association adopted the EMVCo Merchant-Presented QR
 * Code spec ("EMV QR v1.0") with the PromptPay extension. Final payload
 * is an ASCII string of nested TLV (tag-length-value) records with a
 * CRC-16/CCITT-FALSE checksum, exactly as scanned by every Thai banking
 * app (SCB, KBank, KTB, BBL, BAY, TMB, TTB, GSB, …).
 *
 *   00  Payload Format Indicator   "01"   (always 01)
 *   01  Point of Initiation        "11" static  | "12" dynamic (= has amount)
 *   29  Merchant Account Info — PromptPay (nested TLV)
 *       00  AID                    "A000000677010111"  (16 chars)
 *       01  Phone   ("0066"+9-digit, total 13) — when identifier is a phone number
 *       02  NID    (13-digit citizen ID)        — when identifier is a national ID
 *       03  eWalletId (15-digit Truemoney/etc.) — when identifier is an e-wallet
 *   58  Country Code               "TH"
 *   53  Transaction Currency       "764"        (THB, ISO 4217)
 *   54  Transaction Amount         decimal "1234.56" (string, max 13 chars) — optional
 *   63  CRC-16/CCITT-FALSE         "XXXX" (uppercase hex of the whole payload up to and
 *                                  including "6304", computed after appending "6304")
 *
 * This module is *pure* (no Nest dependency, no IO) so it lives in
 * `common/promptpay/` and is reused by the mock adapter AND directly
 * by the API controller when a merchant wants to receive funds without
 * a gateway in front.
 */

export type PromptPayTarget =
  | { kind: 'phone'; value: string }
  | { kind: 'nid'; value: string }
  | { kind: 'ewallet'; value: string };

export interface PromptPayPayloadInput {
  target: PromptPayTarget;
  /** Amount in Thai Baht (decimal, e.g. 12.50). `undefined` → static QR. */
  amount?: number;
}

const PROMPTPAY_AID = 'A000000677010111';

// =============================================================================
// TLV (tag-length-value) primitives
// =============================================================================

/**
 * Encode a single TLV record.
 *   tag    — two ASCII digits (e.g. "00")
 *   value  — UTF-8 ASCII string (no multi-byte runes; PromptPay is ASCII-only)
 *
 * The length is the byte length of `value`, written as a zero-padded
 * two-digit ASCII number ("00".."99"). Values longer than 99 bytes are
 * not representable in the EMVCo spec and throw — every legitimate
 * PromptPay subfield is well under that.
 */
export function tlv(tag: string, value: string): string {
  if (!/^\d{2}$/.test(tag)) {
    throw new RangeError(`TLV tag must be 2 ASCII digits, got "${tag}"`);
  }
  if (value.length > 99) {
    throw new RangeError(`TLV value too long for 2-digit length: ${value.length}`);
  }
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

// =============================================================================
// PromptPay identifier normalisation
// =============================================================================

/**
 * Normalise the identifier into the exact ASCII string the bank apps
 * expect inside the merchant-account TLV.
 *
 *   phone  09xxxxxxxx          → "0066" + last 9 digits        (13 chars)
 *   nid    1-1234-56789-01-2   → strip non-digits, must be 13  (13 chars)
 *   ewallet 004999900000000    → strip non-digits, must be 15  (15 chars)
 */
function normaliseTarget(target: PromptPayTarget): { subTag: string; value: string } {
  const digits = target.value.replace(/\D/g, '');
  switch (target.kind) {
    case 'phone': {
      // Accept "09xxxxxxxx", "+669xxxxxxxx", "0066-9-xxx-xxxxxx", etc.
      let local = digits;
      if (local.startsWith('66') && local.length === 11) local = '0' + local.slice(2);
      if (!/^0\d{9}$/.test(local)) {
        throw new RangeError(`Phone must be a 10-digit Thai number starting with 0 (got "${target.value}")`);
      }
      // Final wire format: "0066" + 9 trailing digits (drop the leading 0).
      return { subTag: '01', value: '0066' + local.slice(1) };
    }
    case 'nid': {
      if (digits.length !== 13) {
        throw new RangeError(`NID must be 13 digits (got ${digits.length})`);
      }
      return { subTag: '02', value: digits };
    }
    case 'ewallet': {
      if (digits.length !== 15) {
        throw new RangeError(`e-Wallet id must be 15 digits (got ${digits.length})`);
      }
      return { subTag: '03', value: digits };
    }
  }
}

// =============================================================================
// CRC-16/CCITT-FALSE
// =============================================================================

/**
 * Bog-standard CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflect,
 * no xor-out). This is the exact variant the EMVCo QR spec mandates,
 * and every Thai bank parser cross-checks against it.
 *
 * Implementation note: bit-walking is fine — the input is always ≤ ~120
 * bytes (the whole TLV minus the last 4 CRC chars) so a precomputed
 * table buys us nothing readable.
 */
export function crc16ccittFalse(data: string): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** Same CRC, returned as a 4-char zero-padded UPPERCASE hex string. */
export function crc16Hex(data: string): string {
  return crc16ccittFalse(data).toString(16).toUpperCase().padStart(4, '0');
}

// =============================================================================
// Public builder
// =============================================================================

/**
 * Format an amount for the EMVCo "54" field. Thai banks expect
 * decimal-string-with-dot, 2 decimals, no thousand separators
 * (e.g. "0.01", "1234.56", "10000.00").
 *
 * We round HALF-UP at the 2nd decimal to keep parity with the way
 * `Intl.NumberFormat('en-US').format(satang/100)` rounds — surprises
 * here mean the user pays a different number than they were shown
 * in the cart.
 */
function formatAmount(baht: number): string {
  if (!Number.isFinite(baht) || baht < 0) {
    throw new RangeError(`Amount must be a finite non-negative number (got ${baht})`);
  }
  // Use Math.round on satang to dodge floating-point drift like 1.005 → 1.005.
  const satang = Math.round(baht * 100);
  const whole = Math.floor(satang / 100).toString();
  const dec = (satang % 100).toString().padStart(2, '0');
  return `${whole}.${dec}`;
}

/**
 * Build a complete EMVCo PromptPay payload, ready to render as a QR.
 *
 *   const payload = buildPromptPayPayload({
 *     target: { kind: 'phone', value: '0812345678' },
 *     amount: 199.00,
 *   });
 *
 * Output is a deterministic ASCII string — same input always produces
 * the same QR, which makes screenshot/golden-file testing pleasant.
 */
export function buildPromptPayPayload(input: PromptPayPayloadInput): string {
  const id = normaliseTarget(input.target);
  // Merchant Account Info subfields — order matters per EMVCo / TBA spec:
  //   00 AID, then exactly one of 01 / 02 / 03 for the identifier.
  const merchantAccountInfo = tlv('00', PROMPTPAY_AID) + tlv(id.subTag, id.value);

  let payload =
    tlv('00', '01') +                                           // Payload Format Indicator
    tlv('01', input.amount != null ? '12' : '11') +             // Point of Initiation
    tlv('29', merchantAccountInfo) +                            // Merchant Account Info (PromptPay)
    tlv('58', 'TH') +                                           // Country
    tlv('53', '764');                                           // Currency (THB)
  if (input.amount != null) {
    payload += tlv('54', formatAmount(input.amount));           // Amount
  }
  // The CRC is computed over the payload *including* the "6304" prefix
  // of the CRC field (tag + length placeholder for 4 hex digits), but
  // *excluding* the 4-digit CRC itself.
  payload += '6304';
  return payload + crc16Hex(payload);
}
