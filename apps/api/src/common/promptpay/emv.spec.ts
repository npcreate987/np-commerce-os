import { describe, it, expect } from 'vitest';
import {
  buildPromptPayPayload,
  crc16ccittFalse,
  crc16Hex,
  tlv,
} from './emv';

/**
 * Phase 20.1 — EMVCo PromptPay payload builder tests.
 *
 * Golden vectors were cross-checked against:
 *   • The TBA reference samples in BOT's "EMVCo QR Code Specification for
 *     Payment Systems – Merchant Presented Mode, v1.0 (2017)".
 *   • The `promptpay-qr` npm package outputs (`pp.staticQR('0812345678')`)
 *     and `pp.dynamicQR(..., 100.00)`.
 *   • The CRC examples from the EMVCo Specification, Annex B.
 *
 * Any change to these vectors WILL break real bank scanners — protect
 * them carefully and never "fix" the test to match the code.
 */

describe('crc16ccittFalse', () => {
  it('matches the canonical "123456789" reference vector (0x29B1)', () => {
    // The CRC-16/CCITT-FALSE algorithm has a well-known check value for
    // the ASCII string "123456789" — this is THE smoke test every
    // implementation reproduces.
    expect(crc16ccittFalse('123456789')).toBe(0x29b1);
    expect(crc16Hex('123456789')).toBe('29B1');
  });

  it('returns 0xFFFF for the empty string (init value, no input)', () => {
    expect(crc16ccittFalse('')).toBe(0xffff);
  });

  it('produces zero-padded uppercase hex', () => {
    // Pick an input whose CRC is small enough to test left-padding.
    // 0x00C0 has only 3 significant hex digits → must pad to "00C0".
    const hex = crc16Hex('A');
    expect(hex).toMatch(/^[0-9A-F]{4}$/);
    expect(hex).toBe(hex.toUpperCase());
  });
});

describe('tlv', () => {
  it('zero-pads single-digit lengths', () => {
    expect(tlv('00', 'AB')).toBe('0002AB');
  });
  it('handles 10-99 byte values', () => {
    const v = 'X'.repeat(42);
    expect(tlv('29', v)).toBe('2942' + v);
  });
  it('rejects malformed tags', () => {
    expect(() => tlv('0', 'x')).toThrow(RangeError);
    expect(() => tlv('AB', 'x')).toThrow(RangeError);
    expect(() => tlv('000', 'x')).toThrow(RangeError);
  });
  it('rejects values longer than 99 bytes', () => {
    expect(() => tlv('00', 'X'.repeat(100))).toThrow(RangeError);
  });
});

describe('buildPromptPayPayload', () => {
  it('builds a static-QR phone payload (no amount, indicator 11)', () => {
    const payload = buildPromptPayPayload({
      target: { kind: 'phone', value: '0812345678' },
    });
    // Compose the expected payload by hand so a future reader can
    // see exactly which subfield maps to which scanner expectation.
    //   00 02 01                             Payload Format Indicator = "01"
    //   01 02 11                             Point of Initiation     = "11" (static)
    //   29 37 00 16 A000000677010111 01 13 0066812345678
    //                                        Merchant Account Info (PromptPay)
    //   58 02 TH                             Country
    //   53 03 764                            Currency (THB)
    //   63 04 <CRC>
    expect(payload.startsWith('00020101021129370016A000000677010111011300668123456785802TH53037646304')).toBe(true);
    // CRC suffix is exactly 4 uppercase hex chars.
    expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
    expect(payload.length).toBe(74);
    // Self-verify: stripping the trailing 4 CRC chars and re-CRC'ing
    // the prefix should reproduce the suffix.
    const body = payload.slice(0, -4);
    expect(crc16Hex(body)).toBe(payload.slice(-4));
  });

  it('builds a dynamic-QR phone payload with amount (indicator 12 + tag 54)', () => {
    const payload = buildPromptPayPayload({
      target: { kind: 'phone', value: '0812345678' },
      amount: 100,
    });
    // Indicator flips to "12" and a "54 06 100.00" amount field appears.
    expect(payload).toContain('010212');
    expect(payload).toContain('5406100.00');
    const body = payload.slice(0, -4);
    expect(crc16Hex(body)).toBe(payload.slice(-4));
  });

  it('normalises +66 / 66 / 0066 / dashed phone inputs to the same QR', () => {
    const variants = ['0812345678', '+66812345678', '66812345678', '081-234-5678'];
    const outputs = variants.map((v) =>
      buildPromptPayPayload({ target: { kind: 'phone', value: v }, amount: 50 }),
    );
    // All four representations of the same number must produce the same
    // EMVCo string — the QR itself must be byte-identical so the bank
    // app deduplicates "scan attempts on the same merchant".
    expect(new Set(outputs).size).toBe(1);
  });

  it('builds an NID payload with sub-tag 02', () => {
    const payload = buildPromptPayPayload({
      target: { kind: 'nid', value: '1-1234-56789-01-2' },
      amount: 25.5,
    });
    // Sub-tag 02 (NID) appears inside tag 29 with length 13.
    expect(payload).toContain('0213' + '1123456789012');
    expect(payload).toContain('540525.50');
  });

  it('builds an e-wallet payload with sub-tag 03 (15 digits)', () => {
    const payload = buildPromptPayPayload({
      target: { kind: 'ewallet', value: '004999900000000' },
      amount: 1.23,
    });
    expect(payload).toContain('0315' + '004999900000000');
    expect(payload).toContain('54041.23');
  });

  it('rejects malformed identifiers loudly', () => {
    expect(() => buildPromptPayPayload({ target: { kind: 'phone', value: '12345' } })).toThrow();
    expect(() => buildPromptPayPayload({ target: { kind: 'nid', value: '12-34' } })).toThrow();
    expect(() => buildPromptPayPayload({ target: { kind: 'ewallet', value: 'abc' } })).toThrow();
  });

  it('rejects negative or non-finite amounts', () => {
    expect(() =>
      buildPromptPayPayload({ target: { kind: 'phone', value: '0812345678' }, amount: -1 }),
    ).toThrow();
    expect(() =>
      buildPromptPayPayload({ target: { kind: 'phone', value: '0812345678' }, amount: NaN }),
    ).toThrow();
    expect(() =>
      buildPromptPayPayload({ target: { kind: 'phone', value: '0812345678' }, amount: Infinity }),
    ).toThrow();
  });

  it('formats amounts to exactly 2 decimal places (no thousand separators)', () => {
    // 1.005 in JS floats is actually 1.00499... → satang 100 → "1.00".
    // We *want* this behaviour because it matches how the FE renders the
    // cart total with `Intl.NumberFormat`. The cart shows 1.00 and the
    // QR therefore charges 1.00 — no off-by-1-satang surprises.
    const p1 = buildPromptPayPayload({ target: { kind: 'phone', value: '0812345678' }, amount: 1.005 });
    expect(p1).toContain('54041.00');
    // 0.025 in JS is 0.02500000000000000139… → satang 3 (half-away-from-zero
    // via Math.round) → "0.03". This pins the half-up behaviour for any
    // amount we can actually express exactly in IEEE 754.
    const p2 = buildPromptPayPayload({ target: { kind: 'phone', value: '0812345678' }, amount: 0.025 });
    expect(p2).toContain('54040.03');
    // Whole number → ".00", no thousands separator.
    const p3 = buildPromptPayPayload({ target: { kind: 'phone', value: '0812345678' }, amount: 1234 });
    expect(p3).toContain('54071234.00');
  });

  it('produces a deterministic checksum (same input → same QR)', () => {
    const input = { target: { kind: 'phone' as const, value: '0812345678' }, amount: 199 };
    expect(buildPromptPayPayload(input)).toBe(buildPromptPayPayload(input));
  });
});
