'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatTHB } from '@/lib/format';
import { ClockIcon, SparklesIcon, WalletIcon } from '@/components/icons';

const ATTRIBUTION_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  PENDING: { label: 'รอปล่อยเงิน', tone: 'warning' },
  RELEASED: { label: 'รับแล้ว', tone: 'success' },
  REVERSED: { label: 'ยกเลิก', tone: 'danger' },
};

export default function CreatorWalletPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.wallet.mine(token!),
    enabled: Boolean(token),
  });

  const statsQuery = useQuery({
    queryKey: ['creator', 'stats'],
    queryFn: () => api.creators.myStats(token!),
    enabled: Boolean(token),
  });

  const attributionsQuery = useQuery({
    queryKey: ['creator', 'attributions'],
    queryFn: () => api.creators.myAttributions(token!),
    enabled: Boolean(token),
  });

  if (walletQuery.isLoading) {
    return (
      <main className="container-mobile pt-4">
        <Skeleton className="h-32" />
      </main>
    );
  }

  const w = walletQuery.data;
  const s = statsQuery.data;
  const items = attributionsQuery.data ?? [];

  return (
    <main className="container-mobile space-y-4 pt-4 pb-12">
      {/* Balance hero */}
      <section className="relative overflow-hidden rounded-3xl bg-mesh-1 p-6 text-white shadow-pop">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-12 h-40 w-40 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80">
            <WalletIcon className="h-4 w-4" />
            <p className="text-xs uppercase tracking-wider">รายได้พร้อมถอน</p>
          </div>
          <p className="mt-1 font-display text-4xl font-extrabold tracking-tight">
            {formatTHB(w?.availableCents ?? 0)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-white/70">รอปล่อย</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">
                {s ? formatTHB(s.pendingCommissionCents) : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-white/70">รับสะสมแล้ว</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">
                {s ? formatTHB(s.releasedCommissionCents) : '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Payout info */}
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex items-center gap-2 text-emerald-900">
          <SparklesIcon className="h-4 w-4" />
          <p className="text-xs font-bold">วิธีการคิดค่าคอม</p>
        </div>
        <p className="mt-1 text-[11px] text-emerald-900/80">
          เมื่อมีคนซื้อผ่านลิงก์ของคุณ ระบบจะ <b>พักเงิน</b> ไว้ก่อน
          จนกว่าออเดอร์จะปิดสำเร็จ (ลูกค้ายืนยันรับสินค้า) เงินจะถูกปล่อยเข้ายอดของคุณทันที
          ถ้ามีการคืนเงิน คอมจะถูกยกเลิกอัตโนมัติ
        </p>
      </section>

      {/* Attributions */}
      <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
        <h2 className="mb-3 text-sm font-bold text-ink-900">ประวัติคอมมิชชั่น</h2>
        {!attributionsQuery.data ? (
          <Skeleton className="h-32" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClockIcon />}
            title="ยังไม่มีรายการ"
            description="เมื่อมีคนซื้อผ่านลิงก์ของคุณ รายการจะปรากฏที่นี่"
            action={
              <Link
                href="/creator/links"
                className="rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-white shadow-glow"
              >
                ไปสร้างลิงก์
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((a) => {
              const meta =
                ATTRIBUTION_STATUS[a.status] ?? { label: a.status, tone: 'neutral' as const };
              return (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <code className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] font-mono text-ink-700">
                        /r/{a.linkCode}
                      </code>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-500">
                      #{a.orderId.slice(0, 8)} · {(a.commissionBps / 100).toFixed(1)}% ·{' '}
                      {formatDate(a.createdAt)}
                    </p>
                  </div>
                  <span
                    className={
                      a.status === 'RELEASED'
                        ? 'text-sm font-bold tabular-nums text-emerald-600'
                        : a.status === 'REVERSED'
                          ? 'text-sm font-bold tabular-nums text-red-500 line-through'
                          : 'text-sm font-bold tabular-nums text-ink-700'
                    }
                  >
                    + {formatTHB(a.commissionCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
