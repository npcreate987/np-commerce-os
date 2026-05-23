'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { CampaignKind, CreateCampaignInput } from '@np/types';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronLeftIcon, FlameIcon, PlusIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

function CampaignsPageInner(): JSX.Element {
  const params = useSearchParams();
  const shopId = params.get('shopId') ?? '';
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['merchant', 'campaigns', shopId],
    queryFn: () => api.campaigns.listForShop(token!, shopId),
    enabled: !!token && !!shopId,
  });

  const toggleM = useMutation({
    mutationFn: (args: { id: string; active: boolean }) =>
      api.campaigns.toggle(token!, args.id, args.active),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['merchant', 'campaigns', shopId] }),
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
          <h1 className="text-xl font-bold text-ink-900">แคมเปญของร้าน</h1>
          <p className="text-[11px] text-ink-500">Flash Deal · Boost · Banner</p>
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
        <CreateCampaignForm
          shopId={shopId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['merchant', 'campaigns', shopId] });
          }}
        />
      ) : null}

      {listQ.isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : !listQ.data || listQ.data.length === 0 ? (
        <EmptyState
          title="ยังไม่มีแคมเปญ"
          description="สร้าง Flash Deal เพื่อเพิ่มยอดขายในช่วงเวลาสั้นๆ"
          icon={<FlameIcon className="h-8 w-8 text-ink-300" />}
        />
      ) : (
        <div className="space-y-3">
          {listQ.data.map((c) => {
            const isFlash = c.kind === 'FLASH_DEAL';
            const isBoost = c.kind === 'BOOST';
            const valueLabel = isFlash
              ? `ลด ${(c.value / 100).toFixed(0)}%`
              : isBoost
                ? `${(c.value / 100).toFixed(0)} ฿/วัน`
                : 'แบนเนอร์';
            const expanded = expandedId === c.id;
            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-2xl bg-white p-4 shadow-card ring-1',
                  c.active ? 'ring-orange-200' : 'opacity-70 ring-ink-200',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                          isFlash
                            ? 'bg-orange-100 text-orange-700'
                            : isBoost
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-sky-100 text-sky-700',
                        )}
                      >
                        {c.kind}
                      </span>
                      <p className="text-sm font-bold text-ink-900">{c.title}</p>
                    </div>
                    {c.description ? (
                      <p className="mt-1 text-[11px] text-ink-500">{c.description}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] font-semibold text-brand">{valueLabel}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {new Date(c.startsAt).toLocaleDateString('th-TH')} →{' '}
                      {new Date(c.endsAt).toLocaleDateString('th-TH')}
                    </p>
                  </div>
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

                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                  className="mt-3 w-full rounded-xl bg-ink-50 py-1.5 text-[11px] font-semibold text-ink-700"
                >
                  {expanded ? 'ซ่อนสินค้า' : 'จัดการสินค้าในแคมเปญ →'}
                </button>

                {expanded ? (
                  <CampaignProductManager campaignId={c.id} shopId={shopId} />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function CampaignProductManager({
  campaignId,
  shopId,
}: {
  campaignId: string;
  shopId: string;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const prodInCampaignQ = useQuery({
    queryKey: ['campaign', campaignId, 'products'],
    queryFn: () => api.campaigns.products(campaignId),
  });
  const myProductsQ = useQuery({
    queryKey: ['products', 'shop', shopId],
    queryFn: () => api.products.listByShop(token!, shopId),
  });

  const joinM = useMutation({
    mutationFn: (productId: string) =>
      api.campaigns.join(token!, campaignId, { productId, stockCap: 0 }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'products'] }),
  });

  const leaveM = useMutation({
    mutationFn: (productId: string) =>
      api.campaigns.leave(token!, campaignId, productId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['campaign', campaignId, 'products'] }),
  });

  const joined = new Set(prodInCampaignQ.data?.map((p) => p.productId) ?? []);

  return (
    <div className="mt-3 space-y-1.5">
      {myProductsQ.data?.map((p) => {
        const isIn = joined.has(p.id);
        return (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 ring-1 ring-ink-100"
          >
            <span className="flex-1 text-[12px] font-medium text-ink-900">
              {p.name}
            </span>
            <button
              type="button"
              onClick={() => (isIn ? leaveM.mutate(p.id) : joinM.mutate(p.id))}
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-semibold',
                isIn
                  ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                  : 'bg-brand-50 text-brand ring-1 ring-brand-100',
              )}
            >
              {isIn ? 'เอาออก' : '+ เพิ่ม'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CreateCampaignForm({
  shopId,
  onClose,
  onCreated,
}: {
  shopId: string;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [form, setForm] = useState<CreateCampaignInput>({
    shopId,
    kind: 'FLASH_DEAL',
    title: '',
    description: '',
    value: 1500,
    startsAt: now.toISOString(),
    endsAt: tomorrow.toISOString(),
  });
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: (input: CreateCampaignInput) => api.campaigns.create(token!, input),
    onSuccess: onCreated,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'สร้างไม่สำเร็จ'),
  });

  return (
    <div className="space-y-3 rounded-3xl border border-orange-200 bg-orange-50/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink-900">สร้างแคมเปญ</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-ink-500"
        >
          ปิด
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { id: 'FLASH_DEAL', label: 'Flash' },
            { id: 'BOOST', label: 'Boost' },
            { id: 'BANNER', label: 'Banner' },
          ] as Array<{ id: CampaignKind; label: string }>
        ).map((k) => (
          <button
            type="button"
            key={k.id}
            onClick={() => setForm({ ...form, kind: k.id })}
            className={cn(
              'rounded-2xl py-2 text-xs font-semibold',
              form.kind === k.id
                ? 'bg-brand-gradient text-white shadow-glow'
                : 'bg-white text-ink-700 ring-1 ring-ink-200',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <input
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="ชื่อแคมเปญ"
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <input
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="รายละเอียด (ไม่บังคับ)"
        className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />

      {form.kind === 'FLASH_DEAL' ? (
        <Field label="ส่วนลด (%) สำหรับสินค้าใน Flash">
          <input
            type="number"
            min={1}
            max={90}
            value={form.value / 100}
            onChange={(e) =>
              setForm({ ...form, value: Math.floor(Number(e.target.value) * 100) })
            }
            className="w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Field label="เริ่ม">
          <input
            type="datetime-local"
            value={form.startsAt.slice(0, 16)}
            onChange={(e) =>
              setForm({ ...form, startsAt: new Date(e.target.value).toISOString() })
            }
            className="w-full rounded-2xl border border-ink-200 bg-white px-2 py-2 text-xs outline-none focus:border-brand"
          />
        </Field>
        <Field label="สิ้นสุด">
          <input
            type="datetime-local"
            value={form.endsAt.slice(0, 16)}
            onChange={(e) =>
              setForm({ ...form, endsAt: new Date(e.target.value).toISOString() })
            }
            className="w-full rounded-2xl border border-ink-200 bg-white px-2 py-2 text-xs outline-none focus:border-brand"
          />
        </Field>
      </div>

      {error ? <p className="text-[11px] text-rose-500">{error}</p> : null}

      <button
        type="button"
        disabled={createM.isPending || !form.title}
        onClick={() => createM.mutate(form)}
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
      <CampaignsPageInner />
    </Suspense>
  );
}
