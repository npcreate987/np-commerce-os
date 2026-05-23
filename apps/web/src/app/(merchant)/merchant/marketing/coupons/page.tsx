'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { CouponKind, CreateCouponInput } from '@np/types';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ChevronLeftIcon,
  GiftIcon,
  PlusIcon,
  TicketIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

function CouponsPageInner(): JSX.Element {
  const params = useSearchParams();
  const shopId = params.get('shopId') ?? '';
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const listQ = useQuery({
    queryKey: ['merchant', 'coupons', shopId],
    queryFn: () => api.coupons.listForShop(token!, shopId),
    enabled: !!token && !!shopId,
  });

  const toggleM = useMutation({
    mutationFn: (args: { id: string; active: boolean }) =>
      api.coupons.toggle(token!, args.id, args.active),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['merchant', 'coupons', shopId] }),
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
          <h1 className="text-xl font-bold text-ink-900">คูปองของร้าน</h1>
          <p className="text-[11px] text-ink-500">ลด %, ลดยอด, ส่งฟรี</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          สร้างคูปอง
        </button>
      </header>

      {creating ? (
        <CreateCouponForm
          shopId={shopId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['merchant', 'coupons', shopId] });
          }}
        />
      ) : null}

      {listQ.isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : !listQ.data || listQ.data.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคูปอง"
          description="สร้างคูปองแรกเพื่อกระตุ้นยอดขาย"
          icon={<TicketIcon className="h-8 w-8 text-ink-300" />}
        />
      ) : (
        <div className="space-y-3">
          {listQ.data.map((c) => {
            const valueLabel =
              c.kind === 'PERCENT'
                ? `ลด ${(c.value / 100).toFixed(0)}%`
                : c.kind === 'FIXED'
                  ? `ลด ${(c.value / 100).toFixed(0)} ฿`
                  : 'ส่งฟรี';
            return (
              <div
                key={c.id}
                className={cn(
                  'overflow-hidden rounded-2xl bg-white shadow-card ring-1 transition',
                  c.active ? 'ring-emerald-200' : 'opacity-70 ring-ink-200',
                )}
              >
                <div className="flex">
                  <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-brand-gradient p-3 text-white">
                    <GiftIcon className="mb-1 h-4 w-4" />
                    <p className="text-center text-[11px] font-bold leading-tight">
                      {valueLabel}
                    </p>
                  </div>
                  <div className="flex-1 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-ink-900">{c.title}</p>
                      <button
                        type="button"
                        onClick={() => toggleM.mutate({ id: c.id, active: !c.active })}
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[10px] font-semibold',
                          c.active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-ink-100 text-ink-500',
                        )}
                      >
                        {c.active ? 'ใช้งาน' : 'ปิด'}
                      </button>
                    </div>
                    <code className="mt-1 inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand">
                      {c.code}
                    </code>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-500">
                      {c.minSpendCents > 0 ? (
                        <span>ขั้นต่ำ {c.minSpendCents / 100} ฿</span>
                      ) : null}
                      {c.totalLimit > 0 ? (
                        <span>
                          ใช้ {c.used}/{c.totalLimit}
                        </span>
                      ) : (
                        <span>ใช้ {c.used} ครั้ง</span>
                      )}
                      <span>ต่อคน {c.perUserLimit || '∞'}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function CreateCouponForm({
  shopId,
  onClose,
  onCreated,
}: {
  shopId: string;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [form, setForm] = useState<CreateCouponInput>({
    shopId,
    code: '',
    title: '',
    kind: 'PERCENT',
    value: 1000,
    minSpendCents: 0,
    maxDiscountCents: 0,
    totalLimit: 0,
    perUserLimit: 1,
  });
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: (input: CreateCouponInput) => api.coupons.create(token!, input),
    onSuccess: onCreated,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'สร้างไม่สำเร็จ'),
  });

  function submit(): void {
    setError(null);
    createM.mutate(form);
  }

  return (
    <div className="space-y-3 rounded-3xl border border-brand-200 bg-brand-50/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink-900">สร้างคูปองใหม่</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-ink-500"
        >
          ปิด
        </button>
      </div>

      <Field label="โค้ด (A-Z, 0-9, _, -)">
        <input
          value={form.code}
          onChange={(e) =>
            setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })
          }
          placeholder="เช่น MYSHOP10"
          maxLength={32}
          className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm font-mono uppercase outline-none focus:border-brand"
        />
      </Field>

      <Field label="ชื่อโปรโมชั่น">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="เช่น ส่วนลดสมาชิกใหม่"
          className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </Field>

      <Field label="ประเภท">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'PERCENT', label: 'ลด %' },
              { id: 'FIXED', label: 'ลดยอด' },
              { id: 'FREE_SHIPPING', label: 'ส่งฟรี' },
            ] as Array<{ id: CouponKind; label: string }>
          ).map((k) => (
            <button
              type="button"
              key={k.id}
              onClick={() => setForm({ ...form, kind: k.id })}
              className={cn(
                'rounded-2xl px-3 py-2 text-xs font-semibold',
                form.kind === k.id
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'bg-white text-ink-700 ring-1 ring-ink-200',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Field>

      {form.kind === 'PERCENT' ? (
        <Field label="ส่วนลด (%)">
          <input
            type="number"
            min={1}
            max={100}
            value={form.value / 100}
            onChange={(e) =>
              setForm({ ...form, value: Math.floor(Number(e.target.value) * 100) })
            }
            className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Field>
      ) : null}

      {form.kind === 'FIXED' ? (
        <Field label="ลด (บาท)">
          <input
            type="number"
            min={1}
            value={form.value / 100}
            onChange={(e) =>
              setForm({ ...form, value: Math.floor(Number(e.target.value) * 100) })
            }
            className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Field label="ขั้นต่ำ (฿)">
          <input
            type="number"
            min={0}
            value={(form.minSpendCents ?? 0) / 100}
            onChange={(e) =>
              setForm({
                ...form,
                minSpendCents: Math.floor(Number(e.target.value) * 100),
              })
            }
            className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Field>
        <Field label="โควต้ารวม (0 = ไม่จำกัด)">
          <input
            type="number"
            min={0}
            value={form.totalLimit ?? 0}
            onChange={(e) =>
              setForm({ ...form, totalLimit: Number(e.target.value) })
            }
            className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Field>
      </div>

      {error ? <p className="text-[11px] text-rose-500">{error}</p> : null}

      <button
        type="button"
        disabled={createM.isPending || !form.code || !form.title}
        onClick={submit}
        className="w-full rounded-2xl bg-brand-gradient py-2.5 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
      >
        บันทึก
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  );
}

export default function Page(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <CouponsPageInner />
    </Suspense>
  );
}
