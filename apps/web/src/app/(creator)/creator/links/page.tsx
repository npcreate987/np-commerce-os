'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ChevronRightIcon,
  LinkIcon,
  MegaphoneIcon,
  PlusIcon,
  SparklesIcon,
} from '@/components/icons';
import type { Product } from '@np/types';

export default function CreatorLinksPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const qc = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['creator', 'me'],
    queryFn: () => api.creators.me(token!),
    enabled: Boolean(token),
    retry: false,
  });
  useEffect(() => {
    if (profileQuery.isSuccess && !profileQuery.data) router.replace('/apply-creator');
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  const linksQuery = useQuery({
    queryKey: ['creator', 'links'],
    queryFn: () => api.creators.myLinks(token!),
    enabled: Boolean(token) && Boolean(profileQuery.data),
  });

  const [showNew, setShowNew] = useState(false);

  return (
    <main className="container-mobile space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-900">ลิงก์ของฉัน</h1>
        <Button size="sm" onClick={() => setShowNew(true)} leftIcon={<PlusIcon />}>
          สร้างลิงก์
        </Button>
      </div>

      {linksQuery.isLoading ? (
        <Skeleton className="h-32" />
      ) : !linksQuery.data || linksQuery.data.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon />}
          title="ยังไม่มีลิงก์"
          description="เริ่มต้นสร้างลิงก์โปรโมทสินค้าที่คุณชอบ"
          action={
            <Button onClick={() => setShowNew(true)} leftIcon={<SparklesIcon />}>
              สร้างลิงก์แรก
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {linksQuery.data.map((l) => {
            const rate = l.commissionBps ?? profileQuery.data?.defaultCommissionBps ?? 500;
            return (
              <li key={l.id}>
                <Link
                  href={`/creator/links/${l.id}`}
                  className="flex items-start gap-3 rounded-3xl border border-ink-100 bg-white p-4 shadow-card active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand">
                    <LinkIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-ink-900">
                        {l.label ?? `Affiliate ${l.code}`}
                      </p>
                      <Badge tone={l.active ? 'success' : 'neutral'}>
                        {l.active ? 'ใช้งานอยู่' : 'ปิด'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      <code className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-ink-700">
                        /r/{l.code}
                      </code>{' '}
                      · {(rate / 100).toFixed(1)}% commission
                    </p>
                    <p className="mt-1 text-[11px] text-ink-500">
                      {l.clickCount} คลิก · {l.conversionCount} ออเดอร์
                    </p>
                  </div>
                  <ChevronRightIcon className="mt-2 h-4 w-4 shrink-0 text-ink-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {showNew && (
        <CreateLinkSheet
          onClose={() => setShowNew(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['creator'] });
            setShowNew(false);
          }}
        />
      )}
    </main>
  );
}

function CreateLinkSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [productId, setProductId] = useState<string>('');
  const [label, setLabel] = useState('');
  const [commissionPct, setCommissionPct] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => api.products.list(50),
  });

  const mut = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      const bps = commissionPct.trim().length > 0
        ? Math.round(Number(commissionPct) * 100)
        : undefined;
      return api.creators.createLink(token, {
        productId: productId || undefined,
        label: label.trim() || undefined,
        commissionBps: bps,
      });
    },
    onSuccess: onCreated,
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'สร้างลิงก์ไม่สำเร็จ'),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-mobile rounded-t-3xl bg-white p-5 shadow-pop">
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-ink-200" />
        <h2 className="text-lg font-bold text-ink-900">สร้างลิงก์ใหม่</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          เลือกสินค้าที่คุณอยากโปรโมท ระบบจะสร้าง short URL + QR ให้ทันที
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-ink-700">เลือกสินค้า</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 h-11 w-full rounded-2xl border border-ink-200 bg-white px-3 text-sm"
            >
              <option value="">— เลือกสินค้า —</option>
              {(productsQuery.data ?? []).map((p: Product) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-700">ป้ายกำกับ (ดูเองในแอป)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="เช่น TikTok bio / IG story"
              className="mt-1 h-11 w-full rounded-2xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink-700">
              ค่าคอม % (เว้นไว้ = ใช้ค่า default)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="50"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              placeholder="5.0"
              className="mt-1 h-11 w-full rounded-2xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          {err && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => {
                setErr(null);
                mut.mutate();
              }}
              loading={mut.isPending}
              disabled={!productId}
            >
              สร้างลิงก์
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
