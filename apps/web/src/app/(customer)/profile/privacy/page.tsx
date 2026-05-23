'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { tracker } from '@/lib/track';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import type { TasteProfileSummary, UserEvent } from '@np/types';

const KIND_LABELS: Record<string, string> = {
  page_view: 'เปิดหน้า',
  session_start: 'เริ่มเซสชัน',
  session_end: 'จบเซสชัน',
  product_view: 'ดูสินค้า',
  product_dwell: 'อยู่บนสินค้านาน',
  product_scroll: 'เลื่อนดูสินค้า',
  shop_view: 'เปิดร้าน',
  category_view: 'เปิดหมวด',
  search_query: 'ค้นหา',
  search_click: 'คลิกผลค้นหา',
  add_to_cart: 'เพิ่มลงตะกร้า',
  remove_from_cart: 'เอาออกจากตะกร้า',
  update_cart_quantity: 'แก้จำนวนตะกร้า',
  checkout_start: 'เริ่ม checkout',
  purchase: 'ซื้อสำเร็จ',
  wishlist_add: 'เพิ่ม wishlist',
  wishlist_remove: 'เอาออก wishlist',
  follow_shop: 'ติดตามร้าน',
  share: 'แชร์',
  video_play: 'เล่นวิดีโอ',
  video_complete: 'ดูวิดีโอจบ',
  noti_open: 'เปิด push',
  email_open: 'เปิดอีเมล',
  chat_open: 'เปิดแชท',
  reco_impression: 'เห็นคำแนะนำ',
  reco_click: 'คลิกคำแนะนำ',
};

export default function PrivacyPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const consentQ = useQuery({
    queryKey: ['privacy', 'consent'],
    queryFn: () => api.privacy.get(token!),
    enabled: !!token,
  });
  const eventsQ = useQuery({
    queryKey: ['privacy', 'events'],
    queryFn: () => api.privacy.myEvents(token!),
    enabled: !!token,
  });
  const tasteQ = useQuery({
    queryKey: ['privacy', 'taste'],
    queryFn: () => api.taste.mine(token!),
    enabled: !!token,
  });

  const rebuildM = useMutation({
    mutationFn: () => api.taste.rebuildMine(token!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['privacy', 'taste'] });
      setFlash('อัปเดตโปรไฟล์การเรียนรู้แล้ว');
      setTimeout(() => setFlash(null), 2000);
    },
  });
  const resetTasteM = useMutation({
    mutationFn: () => api.taste.deleteMine(token!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['privacy', 'taste'] });
      setFlash('รีเซ็ตโปรไฟล์การเรียนรู้แล้ว');
      setTimeout(() => setFlash(null), 2000);
    },
  });

  // Mirror server consent into the client tracker so a fresh load
  // respects the user's preference immediately.
  useEffect(() => {
    if (consentQ.data) {
      tracker.setConsent(consentQ.data.behavioralOptedOut);
    }
  }, [consentQ.data]);

  const updateM = useMutation({
    mutationFn: (next: { behavioralOptedOut?: boolean; retentionDays?: number }) =>
      api.privacy.update(token!, next),
    onSuccess: (next) => {
      tracker.setConsent(next.behavioralOptedOut);
      void qc.invalidateQueries({ queryKey: ['privacy'] });
      setFlash('บันทึกแล้ว');
      setTimeout(() => setFlash(null), 1500);
    },
    onError: (e) => setFlash(e instanceof ApiError ? e.message : 'ไม่สำเร็จ'),
  });

  const deleteM = useMutation({
    mutationFn: () => api.privacy.deleteMyEvents(token!),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['privacy'] });
      setFlash(`ลบประวัติ ${res.deletedEvents} รายการแล้ว`);
      setConfirmDelete(false);
      setTimeout(() => setFlash(null), 2500);
    },
  });

  if (!token) {
    return (
      <main className="container-mobile py-6 pb-28">
        <EmptyState title="ต้องเข้าสู่ระบบ" description="ดูและจัดการ privacy ได้หลัง login" />
      </main>
    );
  }

  const consent = consentQ.data;
  const events = eventsQ.data ?? [];

  return (
    <main className="container-mobile space-y-5 py-6 pb-28">
      <header className="space-y-1">
        <Link
          href="/feed"
          className="inline-flex items-center text-xs text-ink-500"
        >
          ← กลับ
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">
          Privacy
        </p>
        <h1 className="text-xl font-bold text-ink-900">การเรียนรู้พฤติกรรมและความเป็นส่วนตัว</h1>
        <p className="text-xs text-ink-500">
          เลือกได้ว่าจะให้ระบบเรียนรู้พฤติกรรมการใช้งานของคุณเพื่อแนะนำสินค้าที่ตรงใจหรือไม่
        </p>
      </header>

      {flash ? (
        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          {flash}
        </div>
      ) : null}

      {/* ── Toggle ── */}
      <Card>
        <CardHeader>
          <CardTitle>การเรียนรู้พฤติกรรม</CardTitle>
        </CardHeader>
        <div className="space-y-3 p-4 pt-0">
          {consentQ.isLoading || !consent ? (
            <Skeleton className="h-16 rounded-2xl" />
          ) : (
            <ToggleRow
              label="ติดตามและเรียนรู้พฤติกรรม"
              description="ระบบจะบันทึกสินค้าที่คุณดู ค้นหา และซื้อ เพื่อแนะนำของที่น่าจะถูกใจ ปิดได้ทุกเมื่อ"
              checked={!consent.behavioralOptedOut}
              disabled={updateM.isPending}
              onChange={(on) =>
                updateM.mutate({ behavioralOptedOut: !on })
              }
            />
          )}
          {consent ? (
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-ink-700">
                เก็บประวัติพฤติกรรมไว้นาน
              </label>
              <select
                value={consent.retentionDays}
                onChange={(e) =>
                  updateM.mutate({ retentionDays: Number(e.target.value) })
                }
                disabled={updateM.isPending}
                className="w-full rounded-2xl border border-ink-100 bg-white px-3 py-2 text-sm"
              >
                <option value={30}>30 วัน</option>
                <option value={90}>90 วัน</option>
                <option value={180}>180 วัน (ค่าเริ่มต้น)</option>
                <option value={365}>1 ปี</option>
                <option value={730}>2 ปี</option>
              </select>
              <p className="text-[10px] text-ink-400">
                หลังพ้นช่วงนี้ ระบบจะลบประวัติพฤติกรรมของคุณอัตโนมัติ
                ออเดอร์/รีวิวยังเก็บไว้ตามกฎหมายธุรกิจ
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ── Taste profile (Phase 10.2) ── */}
      <Card>
        <CardHeader>
          <CardTitle>สิ่งที่ระบบเรียนรู้ว่าคุณชอบ</CardTitle>
        </CardHeader>
        <div className="space-y-3 p-4 pt-0">
          {tasteQ.isLoading ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : (
            <TasteSummaryBlock summary={tasteQ.data ?? null} />
          )}
          <div className="flex gap-2 border-t border-ink-100 pt-3">
            <Button
              variant="ghost"
              onClick={() => rebuildM.mutate()}
              disabled={rebuildM.isPending}
              className="flex-1 text-brand"
            >
              {rebuildM.isPending ? 'กำลังอัปเดต…' : 'อัปเดตการเรียนรู้'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => resetTasteM.mutate()}
              disabled={resetTasteM.isPending}
              className="flex-1 text-rose-600"
            >
              {resetTasteM.isPending ? 'กำลังรีเซ็ต…' : 'รีเซ็ตโปรไฟล์'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── My events ── */}
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลที่ระบบรู้เกี่ยวกับคุณ</CardTitle>
        </CardHeader>
        <div className="space-y-3 p-4 pt-0">
          {eventsQ.isLoading ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : events.length === 0 ? (
            <p className="text-xs text-ink-500">ยังไม่มีประวัติพฤติกรรม</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {events.slice(0, 50).map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ul>
          )}

          <div className="border-t border-ink-100 pt-3">
            {!confirmDelete ? (
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="text-rose-600"
              >
                ลบประวัติพฤติกรรมทั้งหมดของฉัน
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-rose-700">
                  จะลบ {events.length}+ รายการ — ดำเนินการนี้ยกเลิกไม่ได้
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1"
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    onClick={() => deleteM.mutate()}
                    disabled={deleteM.isPending}
                    className="flex-1 bg-rose-500 hover:bg-rose-600"
                  >
                    {deleteM.isPending ? 'กำลังลบ…' : 'ลบเลย'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </main>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-ink-50/40 px-3 py-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        <p className="mt-0.5 text-[11px] text-ink-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50',
          checked ? 'bg-brand-gradient' : 'bg-ink-200',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

function TasteSummaryBlock({
  summary,
}: {
  summary: TasteProfileSummary | null;
}): JSX.Element {
  if (!summary || summary.isColdStart) {
    return (
      <div className="rounded-2xl bg-ink-50/40 p-3 text-xs text-ink-500">
        ยังไม่มีข้อมูลพอที่จะเรียนรู้รสนิยมของคุณ
        ลองดู/ค้นหา/ซื้อสินค้าสักพักแล้วกลับมาดูใหม่
      </div>
    );
  }
  const updated = new Date(summary.lastUpdatedAt);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <KpiCell label="กิจกรรม" value={`${summary.eventCount}`} />
        <KpiCell
          label="ของที่ดูล่าสุด"
          value={`${summary.recentItemCount} ชิ้น`}
        />
        <KpiCell
          label="งบที่คุณมักดู"
          value={
            summary.priceMedianCents > 0
              ? `฿${Math.round(summary.priceMedianCents / 100).toLocaleString()}`
              : '—'
          }
        />
      </div>
      {summary.topShops.length > 0 ? (
        <Block label="ร้านที่คุณดูบ่อย">
          <div className="flex flex-wrap gap-1.5">
            {summary.topShops.map((s) => (
              <span
                key={s.shopId}
                className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand"
                title={`weight ${s.weight.toFixed(2)}`}
              >
                {s.shopName ?? s.shopId.slice(0, 8)}
              </span>
            ))}
          </div>
        </Block>
      ) : null}
      {summary.topTags.length > 0 ? (
        <Block label="หัวข้อ/คีย์เวิร์ดที่ชอบ">
          <div className="flex flex-wrap gap-1.5">
            {summary.topTags.slice(0, 12).map((t) => (
              <span
                key={t.token}
                className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-1 text-[11px] text-ink-700"
                title={`weight ${t.weight.toFixed(2)}`}
              >
                {t.token}
              </span>
            ))}
          </div>
        </Block>
      ) : null}
      <p className="text-[10px] text-ink-400">
        อัปเดตล่าสุด {updated.toLocaleString('th-TH')}
      </p>
    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl bg-ink-50/60 px-2 py-2">
      <p className="text-sm font-bold text-ink-900">{value}</p>
      <p className="text-[10px] text-ink-500">{label}</p>
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function EventRow({ event }: { event: UserEvent }): JSX.Element {
  const label = KIND_LABELS[event.kind] ?? event.kind;
  return (
    <li className="flex items-baseline justify-between gap-3 rounded-xl bg-ink-50/40 px-3 py-2">
      <div className="flex-1 truncate">
        <p className="text-xs font-semibold text-ink-900">{label}</p>
        {event.entityId ? (
          <p className="truncate text-[10px] text-ink-500">
            {event.entityType ?? '—'}: {event.entityId}
            {event.surface ? ` · ${event.surface}` : ''}
          </p>
        ) : null}
      </div>
      <span className="text-[10px] text-ink-400">
        {new Date(event.ts).toLocaleString('th-TH', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </span>
    </li>
  );
}
