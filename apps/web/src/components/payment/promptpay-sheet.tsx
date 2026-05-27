'use client';

/**
 * Phase 20.1 — PromptPay QR sheet for the order detail page.
 *
 * Renders the EMVCo QR returned by the active payment adapter (mock or
 * Omise) and polls the backend for status. The flow:
 *
 *   1. Page mounts the sheet whenever `order.status === 'PENDING_PAYMENT'`
 *      and `payment.method === 'PROMPTPAY'`. The payment row already
 *      exists in the DB (the checkout submit handler created it).
 *
 *   2. We fetch `payment.qrCodePayload`. Two flavours:
 *        • Bare string  → EMVCo TLV payload (mock + future direct flow).
 *          We encode it client-side with `qrcode.toCanvas`.
 *        • https URL    → Omise scannable_code PNG. Render as <img/>.
 *
 *   3. While the QR is on screen we re-query `payments.byOrder` every
 *      3 s. The webhook (Omise → API) is the source of truth; this poll
 *      is just the FE's way of *observing* that the webhook landed.
 *      We stop polling on `SUCCEEDED | FAILED`.
 *
 *   4. On `SUCCEEDED` we invalidate the order query so the parent
 *      panel re-renders to the PAID state. The sheet unmounts because
 *      its `if (status !== 'PENDING_PAYMENT') return null` gate flips.
 *
 * The dev/CI shortcut (`POST /payments/mock/confirm/:orderId`) is
 * preserved as a small button next to the QR — disabled in production
 * builds via `NEXT_PUBLIC_ENABLE_MOCK_PAYMENT`.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import type { Payment } from '@np/types';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { CheckIcon, QrIcon } from '@/components/icons';
import { formatTHB } from '@/lib/format';

interface Props {
  orderId: string;
  /**
   * Total in cents — shown above the QR so the user double-checks
   * the amount before paying. Authoritative price comes from the
   * server-side `payment.amountCents`; this prop is just for the
   * first paint before polling starts.
   */
  totalCents: number;
}

const POLL_INTERVAL_MS = 3_000;

export function PromptPaySheet({ orderId, totalCents }: Props): JSX.Element | null {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const { data: payment, isLoading } = useQuery<Payment>({
    queryKey: ['payment', orderId],
    queryFn: () => api.payments.byOrder(token!, orderId),
    enabled: Boolean(token),
    // Phase 20.1 — keep polling while we're waiting for the bank's webhook.
    // Stop the moment we observe a terminal state.
    refetchInterval: (query) => {
      const d = query.state.data as Payment | undefined;
      if (!d) return POLL_INTERVAL_MS;
      return d.status === 'PENDING' ? POLL_INTERVAL_MS : false;
    },
    refetchIntervalInBackground: false,
  });

  // When the payment settles → invalidate the order so the parent UI
  // flips from PENDING_PAYMENT → PAID and unmounts this sheet.
  useEffect(() => {
    if (payment?.status === 'SUCCEEDED') {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    }
  }, [payment?.status, qc, orderId]);

  // Render the QR as soon as we have the payload.
  useEffect(() => {
    const payload = payment?.qrCodePayload;
    if (!payload || !canvasRef.current) return;
    if (isUrl(payload)) return; // <img> branch handles URL payloads — no canvas draw.
    QRCode.toCanvas(
      canvasRef.current,
      payload,
      {
        // Largest plausible PromptPay payload is ~120 chars → fits well
        // inside QR version ~6. Margin 1 keeps the visual code dense
        // but still scannable on lower-end Android cameras (we tested
        // on a 720p front-facing webcam to a 256-px-wide canvas).
        width: 256,
        margin: 1,
        // High error-correction — tolerates a partial finger covering
        // the code while the customer takes the screenshot.
        errorCorrectionLevel: 'H',
        color: { dark: '#0F172A', light: '#FFFFFF' },
      },
      (err) => {
        if (err) setQrError(err.message);
      },
    );
  }, [payment?.qrCodePayload]);

  const mockConfirm = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.payments.confirmMock(token, orderId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment', orderId] });
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });

  if (!token) return null;
  if (isLoading) {
    return (
      <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
        <div className="grid h-64 place-items-center">
          <QrIcon className="h-10 w-10 animate-pulse text-ink-300" />
        </div>
      </section>
    );
  }
  if (!payment || payment.status !== 'PENDING' || !payment.qrCodePayload) {
    // Either the row doesn't exist (checkout still in flight) or it
    // already settled. Hide the sheet — parent will show its own state.
    return null;
  }
  const enableMock = process.env.NEXT_PUBLIC_ENABLE_MOCK_PAYMENT !== 'false';
  const amountCents = payment.amountCents || totalCents;

  return (
    <section className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <div className="border-b border-ink-100 bg-mesh-2 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <QrIcon className="h-4 w-4" />
          <p className="text-xs uppercase tracking-wider text-white/80">
            สแกนเพื่อชำระด้วย PromptPay
          </p>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">{formatTHB(amountCents)}</p>
        <p className="mt-0.5 text-[11px] text-white/70">
          เปิดแอปธนาคาร → สแกน QR → ยืนยันยอดให้ตรงกับด้านบน
        </p>
      </div>

      <div className="grid place-items-center px-4 py-6">
        {isUrl(payment.qrCodePayload) ? (
          // Omise returns a hosted PNG URL — render directly. We don't use
          // `next/image` here because the Capacitor build is a static
          // export (no image optimisation service to call) and adding
          // Omise's CDN to `images.remotePatterns` for one URL adds
          // brittleness for zero perf win.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={payment.qrCodePayload}
            alt="PromptPay QR"
            className="h-64 w-64 rounded-2xl border border-ink-100 bg-white object-contain"
          />
        ) : (
          // EMVCo string — encode on the client.
          <canvas
            ref={canvasRef}
            className="h-64 w-64 rounded-2xl border border-ink-100 bg-white"
            aria-label="PromptPay QR"
          />
        )}
        {qrError && (
          <p className="mt-3 text-center text-xs text-rose-600">
            สร้าง QR ไม่สำเร็จ: {qrError}
          </p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-500">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          กำลังรอการชำระเงิน… (ตรวจสอบทุก {POLL_INTERVAL_MS / 1000} วินาที)
        </p>
      </div>

      {enableMock && (
        <div className="border-t border-ink-100 bg-ink-50/50 px-4 py-3">
          <Button
            fullWidth
            variant="ghost"
            onClick={() => mockConfirm.mutate()}
            loading={mockConfirm.isPending}
            leftIcon={<CheckIcon className="h-4 w-4" />}
          >
            จำลองการชำระเงิน (dev)
          </Button>
        </div>
      )}
    </section>
  );
}

/** Cheap guard: does the payload look like an http(s) URL? */
function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}
