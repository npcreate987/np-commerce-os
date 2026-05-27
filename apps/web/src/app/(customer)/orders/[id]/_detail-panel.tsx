'use client';

/**
 * Phase 14.5 — Order detail PANEL (shared between mobile + desktop).
 *
 * The mobile variant wraps this in a sticky header + container-mobile
 * layout. The desktop variant drops it straight into the right pane of
 * the Gmail-style split. The panel itself has no page chrome — it's
 * pure detail content scoped to the given order id.
 *
 * Pulled almost verbatim from the original `[id]/page.tsx`; only changes
 * are (1) it no longer owns the layout chrome, and (2) the dispute sheet
 * still mounts via portal-like fixed positioning so it works in both
 * layouts.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DisputeReason } from '@np/types';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatTHB } from '@/lib/format';
import {
  AlertCircleIcon,
  BoxIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  MessageIcon,
  ShieldCheckIcon,
  TruckIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { StarPicker, StarRating } from '@/components/rating';
import { PromptPaySheet } from '@/components/payment/promptpay-sheet';
import { ORDER_STATUS } from '../_list-panel';

const SHIP_TIMELINE = [
  { key: 'LABEL_CREATED',     label: 'สร้างใบนำส่ง' },
  { key: 'PICKED_UP',         label: 'รับเข้าโกดัง' },
  { key: 'IN_TRANSIT',        label: 'อยู่ระหว่างขนส่ง' },
  { key: 'OUT_FOR_DELIVERY',  label: 'พนักงานนำส่ง' },
  { key: 'DELIVERED',         label: 'จัดส่งสำเร็จ' },
];

export function OrderDetailPanel({ orderId }: { orderId: string }): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [showDispute, setShowDispute] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.orders.getOne(token, orderId);
    },
    enabled: Boolean(token),
    retry: false,
  });

  const { data: shipment } = useQuery({
    queryKey: ['shipment', orderId],
    queryFn: async () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      try {
        return await api.shipments.byOrder(token, orderId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(
      token && order && ['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(order.status),
    ),
    retry: false,
  });

  // Phase 20.1 — payment mutation lives inside <PromptPaySheet/> now;
  // it owns both the polling AND the dev-mode mock-confirm button.

  const advance = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.shipments.advance(token, orderId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipment', orderId] }),
  });

  const confirmReceive = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.orders.confirmReceived(token, orderId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', orderId] }),
  });

  if (!token) {
    return <p className="p-6 text-sm text-ink-600">กรุณาเข้าสู่ระบบ</p>;
  }
  if (isLoading || !order) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const status = ORDER_STATUS[order.status] ?? {
    label: order.status,
    tone: 'neutral' as const,
  };
  const canConfirm = order.status === 'SHIPPED' || order.status === 'DELIVERED';
  const canDispute = ['PAID', 'SHIPPED', 'DELIVERED'].includes(order.status);
  const shipIdx = shipment
    ? SHIP_TIMELINE.findIndex((s) => s.key === shipment.status)
    : -1;

  return (
    <div className="space-y-4">
      {/* ----- Status header ---- */}
      <section className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
        <div className="bg-mesh-1 p-4 text-white">
          <p className="text-xs uppercase tracking-wider text-white/70">สถานะออเดอร์</p>
          <p className="text-xl font-bold">{status.label}</p>
          <p className="mt-1 text-xs text-white/80">
            {order.status === 'PENDING_PAYMENT' &&
              'กรุณาชำระเงินเพื่อให้ร้านค้าจัดส่งสินค้า'}
            {order.status === 'PAID' && 'ชำระเงินแล้ว — รอร้านจัดส่ง'}
            {order.status === 'SHIPPED' && 'สินค้าออกจัดส่งแล้ว ติดตามได้ด้านล่าง'}
            {order.status === 'DELIVERED' &&
              'พัสดุถึงปลายทางแล้ว กรุณายืนยันรับสินค้า'}
            {order.status === 'COMPLETED' && 'ออเดอร์สำเร็จ — ขอบคุณที่ใช้บริการ'}
            {order.status === 'CANCELLED' && 'ออเดอร์ถูกยกเลิก'}
            {order.status === 'REFUNDED' && 'ออเดอร์ได้รับการคืนเงินแล้ว'}
          </p>
        </div>

        {shipment && (
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TruckIcon className="h-4 w-4 text-brand" />
                <p className="text-sm font-semibold text-ink-900">
                  {shipment.carrierName}
                </p>
              </div>
              {shipment.trackingNo && (
                <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-ink-700">
                  {shipment.trackingNo}
                </span>
              )}
            </div>
            <ol className="relative flex justify-between">
              {SHIP_TIMELINE.map((step, idx) => {
                const reached = idx <= shipIdx;
                return (
                  <li
                    key={step.key}
                    className="relative flex flex-1 flex-col items-center"
                  >
                    {idx > 0 && (
                      <div
                        className={cn(
                          'absolute -left-1/2 right-1/2 top-3 h-0.5',
                          reached ? 'bg-brand' : 'bg-ink-100',
                        )}
                      />
                    )}
                    <div
                      className={cn(
                        'relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2',
                        reached
                          ? 'border-brand bg-brand text-white'
                          : 'border-ink-200 bg-white text-ink-400',
                      )}
                    >
                      {reached ? (
                        <CheckIcon className="h-3 w-3" />
                      ) : (
                        <span className="text-[10px]">{idx + 1}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'mt-1.5 text-center text-[10px]',
                        reached ? 'font-medium text-ink-900' : 'text-ink-400',
                      )}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>

            {shipment.status !== 'DELIVERED' && (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-center justify-between gap-2">
                  <span>โหมด dev: ก้าวสถานะถัดไป</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => advance.mutate()}
                    loading={advance.isPending}
                  >
                    Advance
                  </Button>
                </div>
              </div>
            )}

            {shipment.events.length > 0 && (
              <details className="group mt-3">
                <summary className="cursor-pointer text-xs font-medium text-ink-600">
                  ดูประวัติทั้งหมด ({shipment.events.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {[...shipment.events].reverse().map((e, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-xl bg-ink-50 px-2.5 py-1.5 text-[11px]"
                    >
                      <ClockIcon className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />
                      <div>
                        <p className="font-medium text-ink-700">{e.description}</p>
                        <p className="text-ink-400">{formatDate(e.at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {/* ----- Items + totals ---- */}
      <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <BoxIcon className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink-900">รายการสินค้า</h2>
        </div>
        <ul className="divide-y divide-ink-100">
          {order.items.map((i) => (
            <li
              key={i.id}
              className="flex justify-between gap-3 py-2.5 text-sm"
            >
              <span className="line-clamp-2 text-ink-700">
                {i.productName}{' '}
                <span className="text-ink-400">× {i.quantity}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-ink-900">
                {formatTHB(i.subtotalCents)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm">
          <div className="flex justify-between text-ink-600">
            <span>ราคาสินค้า</span>
            <span className="tabular-nums">{formatTHB(order.subtotalCents)}</span>
          </div>
          <div className="flex justify-between text-ink-600">
            <span>ค่าจัดส่ง</span>
            <span className="tabular-nums">
              {order.shippingCents === 0 ? 'ฟรี' : formatTHB(order.shippingCents)}
            </span>
          </div>
          {order.discountCents && order.discountCents > 0 ? (
            <div className="flex justify-between text-emerald-600">
              <span>
                ส่วนลด{order.couponCode ? ` (${order.couponCode})` : ''}
              </span>
              <span className="tabular-nums">
                - {formatTHB(order.discountCents)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold">
            <span>รวมทั้งสิ้น</span>
            <span className="tabular-nums text-brand">
              {formatTHB(order.totalCents)}
            </span>
          </div>
        </div>
      </section>

      {/* ----- Address ---- */}
      <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <MapPinIcon className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink-900">ที่อยู่จัดส่ง</h2>
        </div>
        <div className="space-y-0.5 text-sm">
          <p className="font-medium text-ink-900">{order.shippingAddress.fullName}</p>
          <p className="text-ink-600">{order.shippingAddress.phone}</p>
          <p className="text-ink-600">{order.shippingAddress.line1}</p>
          <p className="text-ink-600">
            {order.shippingAddress.province} {order.shippingAddress.postalCode}
          </p>
        </div>
      </section>

      {/* ----- NP Protect ---- */}
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-bold text-emerald-900">NP Protect</h2>
        </div>
        <p className="text-xs text-emerald-900/80">
          {order.status === 'COMPLETED'
            ? 'ออเดอร์นี้ปิดเรียบร้อยแล้ว — เงินถูกส่งให้ร้านค้า'
            : order.status === 'REFUNDED'
              ? 'ออเดอร์นี้ได้รับการคืนเงินเรียบร้อยแล้ว'
              : 'เงินของคุณถูกพักไว้ที่ TuKTuK จนกว่าคุณกดยืนยันรับสินค้า ถ้ามีปัญหาสามารถเปิดข้อพิพาทได้'}
        </p>
      </section>

      {/* ----- PromptPay QR sheet ---- */}
      {/* Phase 20.1 — Render the QR (+ live polling) while we wait for the bank
          webhook. The sheet hides itself once the payment row flips to
          SUCCEEDED, at which point the order also flips to PAID via the
          invalidate hook inside the sheet. */}
      {order.status === 'PENDING_PAYMENT' && (
        <PromptPaySheet orderId={orderId} totalCents={order.totalCents} />
      )}

      {/* ----- Actions ---- */}
      <div className="grid gap-2">
        {/*
          The old single-click "จำลองการชำระเงิน (mock)" button has been
          subsumed into <PromptPaySheet/> so dev / CI / staging users
          still get a one-tap confirm next to the QR they're scanning.
        */}
        {canConfirm && (
          <Button
            fullWidth
            variant="primary"
            onClick={() => confirmReceive.mutate()}
            loading={confirmReceive.isPending}
            leftIcon={<CheckIcon className="h-4 w-4" />}
          >
            ยืนยันรับสินค้า — ปล่อยเงินให้ร้าน
          </Button>
        )}
        {canDispute && (
          <Button
            fullWidth
            variant="outline"
            onClick={() => setShowDispute(true)}
            leftIcon={<AlertCircleIcon className="h-4 w-4" />}
          >
            แจ้งปัญหา / เปิดข้อพิพาท
          </Button>
        )}
      </div>

      {['DELIVERED', 'COMPLETED'].includes(order.status) && (
        <ReviewBlock
          orderId={order.id}
          items={order.items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
          }))}
        />
      )}

      {showDispute && (
        <DisputeSheet
          orderId={order.id}
          onClose={() => setShowDispute(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// ReviewBlock + WriteReviewForm + DisputeSheet — moved verbatim from
// `[id]/page.tsx`. No behavioural changes; just relocated so the detail
// panel is self-contained for desktop reuse.
// ============================================================================

function ReviewBlock({
  orderId,
  items,
}: {
  orderId: string;
  items: Array<{ productId: string; productName: string }>;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const myQ = useQuery({
    queryKey: ['reviews', 'mine'],
    queryFn: () => api.reviews.mine(token!),
    enabled: !!token,
    retry: false,
  });
  const myForOrder = (myQ.data ?? []).filter((r) => r.orderId === orderId);

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg leading-none text-amber-500">★</span>
        <h2 className="text-sm font-bold text-amber-900">รีวิวสินค้านี้</h2>
      </div>
      <ul className="space-y-3">
        {items.map((it) => {
          const mine = myForOrder.find((r) => r.productId === it.productId);
          return (
            <li key={it.productId}>
              <p className="mb-1 line-clamp-1 text-sm font-semibold text-ink-900">
                {it.productName}
              </p>
              {mine ? (
                <div className="rounded-2xl bg-white p-3 ring-1 ring-ink-100">
                  <div className="flex items-center justify-between">
                    <StarRating value={mine.rating} size="sm" />
                    <span className="text-[10px] text-emerald-600">✓ รีวิวแล้ว</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-ink-700">
                    {mine.body}
                  </p>
                </div>
              ) : (
                <WriteReviewForm orderId={orderId} productId={it.productId} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WriteReviewForm({
  orderId,
  productId,
}: {
  orderId: string;
  productId: string;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<
    Array<{ uploadId: string; publicUrl: string }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.reviews.create(token, {
        orderId,
        productId,
        rating,
        body,
        photoUploadIds: photos.map((p) => p.uploadId),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      setBody('');
      setPhotos([]);
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'ส่งรีวิวไม่สำเร็จ'),
  });

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0 || !token) return;
    const room = 5 - photos.length;
    if (room <= 0) return;
    setUploading(true);
    setError(null);
    try {
      const { uploadFile } = await import('@/lib/upload');
      const slice = Array.from(files).slice(0, room);
      const out: Array<{ uploadId: string; publicUrl: string }> = [];
      for (const f of slice) {
        const r = await uploadFile(token, f, 'review_photo');
        out.push({ uploadId: r.uploadId, publicUrl: r.publicUrl });
      }
      setPhotos((prev) => [...prev, ...out]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-ink-100">
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="เล่าประสบการณ์ของคุณ — เช่น คุณภาพสินค้า, ขนส่ง, การบริการ"
        className="mt-2 w-full rounded-2xl border border-ink-200 bg-white p-3 text-sm outline-none focus:border-brand"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {photos.map((p, idx) => (
          <div
            key={p.uploadId}
            className="relative h-16 w-16 overflow-hidden rounded-xl ring-1 ring-ink-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.publicUrl}
              alt={`รูปรีวิว ${idx + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() =>
                setPhotos((prev) =>
                  prev.filter((x) => x.uploadId !== p.uploadId),
                )
              }
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white"
              aria-label="ลบรูป"
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < 5 && (
          <label
            className={cn(
              'flex h-16 w-16 cursor-pointer items-center justify-center rounded-xl border border-dashed border-ink-300 text-[10px] font-semibold text-ink-500',
              uploading && 'opacity-50',
            )}
          >
            {uploading ? '…' : '+ รูป'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </label>
        )}
      </div>
      {error && (
        <p className="mt-1 text-[11px] font-medium text-rose-500">{error}</p>
      )}
      <Button
        fullWidth
        className="mt-2"
        size="sm"
        disabled={rating < 1 || body.trim().length < 1 || uploading}
        loading={createM.isPending}
        onClick={() => createM.mutate()}
      >
        ส่งรีวิว
      </Button>
    </div>
  );
}

function DisputeSheet({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const [reason, setReason] = useState<DisputeReason>('NOT_AS_DESCRIBED');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    if (!token) return;
    if (description.trim().length < 5) {
      setError('กรุณาอธิบายปัญหาอย่างน้อย 5 ตัวอักษร');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const d = await api.disputes.open(token, orderId, { reason, description });
      router.push(`/disputes/${d.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ไม่สามารถเปิดข้อพิพาทได้');
    } finally {
      setLoading(false);
    }
  }

  const REASONS: Array<{ value: DisputeReason; label: string }> = [
    { value: 'ITEM_NOT_RECEIVED', label: 'ไม่ได้รับสินค้า' },
    { value: 'NOT_AS_DESCRIBED', label: 'สินค้าไม่ตรงปก' },
    { value: 'DAMAGED', label: 'สินค้าเสียหาย' },
    { value: 'OTHER', label: 'อื่นๆ' },
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40 backdrop-blur-sm lg:items-center lg:justify-center">
      <div className="w-full rounded-t-3xl bg-white p-5 shadow-pop lg:max-w-md lg:rounded-3xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-900">
              เปิดข้อพิพาท
            </h3>
            <p className="text-xs text-ink-500">NP Protect จะช่วยคุ้มครองคุณ</p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-ink-400"
            aria-label="ปิด"
          >
            ×
          </button>
        </div>

        <p className="mb-2 text-xs font-medium text-ink-700">เลือกประเภทปัญหา</p>
        <div className="grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={cn(
                'rounded-2xl border p-3 text-left text-sm transition active:scale-[0.98]',
                reason === r.value
                  ? 'border-brand bg-brand-50 font-semibold text-brand'
                  : 'border-ink-100 bg-white text-ink-700',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-ink-700">
            รายละเอียดปัญหา
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="อธิบายให้ละเอียด เช่น สินค้าสีไม่ตรง / ขนาดผิด..."
            className="w-full rounded-2xl border border-ink-200 bg-white p-3 text-sm focus:border-brand focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
        )}

        <Button
          fullWidth
          className="mt-4"
          onClick={submit}
          loading={loading}
          leftIcon={<MessageIcon className="h-4 w-4" />}
        >
          เปิดข้อพิพาท
        </Button>
      </div>
    </div>
  );
}
