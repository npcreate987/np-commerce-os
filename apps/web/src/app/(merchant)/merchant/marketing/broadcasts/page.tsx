'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { CreateBroadcastInput } from '@np/types';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronLeftIcon, MegaphoneIcon, PlusIcon, SendIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

function BroadcastsPageInner(): JSX.Element {
  const params = useSearchParams();
  const shopId = params.get('shopId') ?? '';
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const listQ = useQuery({
    queryKey: ['merchant', 'broadcasts', shopId],
    queryFn: () => api.broadcasts.listForShop(token!, shopId),
    enabled: !!token && !!shopId,
  });

  const sendM = useMutation({
    mutationFn: (id: string) => api.broadcasts.send(token!, id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['merchant', 'broadcasts', shopId] }),
  });

  return (
    <main className="container-mobile space-y-4 pb-20 pt-4">
      <header className="flex items-center gap-2">
        <Link
          href="/merchant/marketing"
          className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white ring-1 ring-ink-200"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-ink-900">ส่งข้อความถึงลูกค้า</h1>
          <p className="text-[11px] text-ink-500">In-app · ทั่วไป + AI Segments (RFM)</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          สร้าง
        </button>
      </header>

      {creating ? (
        <CreateBroadcastForm
          shopId={shopId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['merchant', 'broadcasts', shopId] });
          }}
        />
      ) : null}

      {listQ.isLoading ? (
        <Skeleton className="h-20 rounded-2xl" />
      ) : !listQ.data || listQ.data.length === 0 ? (
        <EmptyState
          title="ยังไม่มี Broadcast"
          description="สร้างข้อความแล้วส่งถึงลูกค้าตามกลุ่มเป้าหมาย"
          icon={<MegaphoneIcon className="h-8 w-8 text-ink-300" />}
        />
      ) : (
        <div className="space-y-2">
          {listQ.data.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        b.status === 'SENT'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {b.status}
                    </span>
                    <span className="text-[10px] font-semibold text-ink-500">
                      {b.audience}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-ink-900">{b.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-500">{b.body}</p>
                  {b.status === 'SENT' ? (
                    <p className="mt-1 text-[10px] text-emerald-600">
                      ส่งแล้ว {b.sentCount.toLocaleString()} คน
                    </p>
                  ) : null}
                </div>
                {b.status !== 'SENT' ? (
                  <button
                    type="button"
                    onClick={() => sendM.mutate(b.id)}
                    disabled={sendM.isPending}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow disabled:opacity-50"
                  >
                    <SendIcon className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function CreateBroadcastForm({
  shopId,
  onClose,
  onCreated,
}: {
  shopId: string;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [form, setForm] = useState<CreateBroadcastInput>({
    shopId,
    channel: 'INAPP',
    audience: 'BUYERS',
    title: '',
    body: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: (input: CreateBroadcastInput) => api.broadcasts.create(token!, input),
    onSuccess: onCreated,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'สร้างไม่สำเร็จ'),
  });

  return (
    <div className="space-y-3 rounded-3xl border border-sky-200 bg-sky-50/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink-900">สร้าง Broadcast</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-ink-500"
        >
          ปิด
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-ink-700">กลุ่มเป้าหมาย</span>
        <select
          value={form.audience}
          onChange={(e) =>
            setForm({ ...form, audience: e.target.value as CreateBroadcastInput['audience'] })
          }
          className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <optgroup label="ทั่วไป">
            <option value="ALL">ทุกคน (CUSTOMER)</option>
            <option value="BUYERS">เคยซื้อร้านนี้</option>
            <option value="ABANDONED_CART">มีสินค้าในตะกร้า</option>
            <option value="WIN_BACK">ไม่ซื้อ &gt; 30 วัน</option>
            <option value="VIP">VIP (Gold+)</option>
          </optgroup>
          <optgroup label="AI Segments (RFM)">
            <option value="SEG_CHAMPIONS">⭐ Champions — ซื้อบ่อย+ยอดสูง+ล่าสุด</option>
            <option value="SEG_LOYAL">💜 Loyal — ขาประจำ</option>
            <option value="SEG_NEW">🌱 New — ลูกค้าหน้าใหม่</option>
            <option value="SEG_AT_RISK">⚠️ At Risk — เริ่มหาย 30-90 วัน</option>
            <option value="SEG_LOST">💔 Lost — หายไป &gt; 90 วัน</option>
          </optgroup>
        </select>
        <AudiencePreview shopId={shopId} audience={form.audience} />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-ink-700">
          ช่องทาง
        </span>
        <select
          value={form.channel}
          onChange={(e) =>
            setForm({
              ...form,
              channel: e.target.value as CreateBroadcastInput['channel'],
            })
          }
          className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="INAPP">📨 In-app (กล่องข้อความ) — เปิดเสมอ</option>
          <option value="PUSH">🔔 Push (Web/App) + In-app</option>
          <option value="EMAIL">✉️ Email + In-app</option>
          <option value="LINE">💬 LINE OA + In-app</option>
        </select>
        <ChannelAvailability channel={form.channel} />
      </label>

      <input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="หัวข้อ"
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <textarea
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        placeholder="เนื้อหา (ส่วนลด, โปรโมชั่น, ของใหม่)"
        rows={3}
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />

      {error ? <p className="text-[11px] text-rose-500">{error}</p> : null}

      <button
        type="button"
        disabled={createM.isPending || !form.title || !form.body}
        onClick={() => createM.mutate(form)}
        className="w-full rounded-2xl bg-brand-gradient py-2.5 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
      >
        บันทึก (ยังไม่ส่ง)
      </button>
    </div>
  );
}

function AudiencePreview({
  shopId,
  audience,
}: {
  shopId: string;
  audience: string;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const previewQ = useQuery({
    queryKey: ['broadcasts', 'preview', shopId, audience],
    queryFn: () => api.broadcasts.audiencePreview(token!, audience, shopId || null),
    enabled: !!token,
    retry: false,
  });
  return (
    <p className="mt-1.5 text-[11px] font-semibold text-brand">
      {previewQ.isLoading ? (
        'กำลังนับผู้รับ...'
      ) : previewQ.isError ? (
        <span className="text-rose-500">นับไม่ได้ (ลองอีกครั้ง)</span>
      ) : (
        <>→ จะส่งถึง ~{previewQ.data?.count.toLocaleString() ?? 0} คน</>
      )}
    </p>
  );
}

function ChannelAvailability({
  channel,
}: {
  channel: CreateBroadcastInput['channel'];
}): JSX.Element | null {
  const configQ = useQuery({
    queryKey: ['notif-config'],
    queryFn: () => api.notifications.config(),
  });
  if (!configQ.data) return null;
  const cfg = configQ.data;
  let warning: string | null = null;
  if (channel === 'PUSH' && !cfg.webPushEnabled && !cfg.fcmEnabled) {
    warning = '⚠️ ผู้ดูแลยังไม่ตั้งค่า VAPID/FCM — Push จะถูกข้าม (In-app ส่งปกติ)';
  } else if (channel === 'EMAIL' && !cfg.emailEnabled) {
    warning = '⚠️ ยังไม่ตั้งค่า Email provider — Email จะถูกข้าม (In-app ส่งปกติ)';
  } else if (channel === 'LINE' && !cfg.lineEnabled) {
    warning = '⚠️ ยังไม่ตั้งค่า LINE OA — LINE จะถูกข้าม (In-app ส่งปกติ)';
  }
  if (!warning) return null;
  return (
    <p className="mt-1.5 text-[11px] font-semibold text-amber-600">{warning}</p>
  );
}

export default function Page(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <BroadcastsPageInner />
    </Suspense>
  );
}
