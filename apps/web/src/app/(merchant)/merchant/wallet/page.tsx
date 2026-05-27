'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatTHB } from '@/lib/format';
import { ChevronLeftIcon, ClockIcon, WalletIcon } from '@/components/icons';

const KIND_TH: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
  ESCROW_HOLD: { label: 'พักเงิน', tone: 'warning' },
  ESCROW_RELEASE: { label: 'ปล่อยเงิน', tone: 'success' },
  ESCROW_REFUND: { label: 'คืนเงิน', tone: 'danger' },
  PAYOUT: { label: 'ถอนเงิน', tone: 'info' },
  ADJUSTMENT: { label: 'ปรับยอด', tone: 'neutral' },
  COMMISSION_EARN: { label: 'รับคอม.', tone: 'success' },
  COMMISSION_PAY: { label: 'จ่ายคอม.', tone: 'warning' },
};

export default function MerchantWalletPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);

  const { data: wallet, isLoading } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.wallet.mine(token);
    },
    enabled: Boolean(token),
  });

  const { data: entries } = useQuery({
    queryKey: ['wallet', 'entries'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.wallet.entries(token);
    },
    enabled: Boolean(token),
  });

  return (
    <main className="pb-28">
      <header
        className="glass sticky top-0 z-20 border-b border-white/40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <Link
            href="/merchant/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 active:scale-95"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="font-display text-base font-bold tracking-tight text-ink-900">
            กระเป๋าเงิน
          </h1>
        </div>
      </header>

      <div className="container-mobile space-y-4 pt-4">
        {/* Balance card */}
        {isLoading || !wallet ? (
          <Skeleton className="h-44" />
        ) : (
          <section className="relative overflow-hidden rounded-3xl bg-mesh-1 p-6 text-white shadow-pop">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-fuchsia-400/30 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 text-white/80">
                <WalletIcon className="h-4 w-4" />
                <p className="text-xs uppercase tracking-wider">ยอดพร้อมถอน</p>
              </div>
              <p className="mt-1 font-display text-4xl font-extrabold tracking-tight">
                {formatTHB(wallet.availableCents)}
              </p>
              <div className="mt-3 flex items-center gap-3 text-xs text-white/80">
                <span className="rounded-full bg-white/10 px-3 py-1.5">
                  รออนุมัติ {formatTHB(wallet.pendingCents)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Info */}
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-xs font-bold text-emerald-900">วิธีคิดเงิน escrow</p>
          <p className="mt-1 text-[11px] text-emerald-900/80">
            เมื่อลูกค้าชำระเงิน → ระบบจะ &ldquo;พักเงิน&rdquo; ไว้ที่ TuKTuK
            <br />
            เมื่อลูกค้ากดยืนยันรับสินค้า (หรือผ่าน 7 วันโดยอัตโนมัติ) → เงินจะถูกปล่อยเข้ายอดพร้อมถอน
          </p>
        </section>

        {/* Entries */}
        <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">ประวัติการเดินบัญชี</h2>
          {!entries ? (
            <Skeleton className="h-32" />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<ClockIcon />}
              title="ยังไม่มีรายการ"
              description="รายการจะปรากฏที่นี่เมื่อมีออเดอร์เข้ามา"
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {entries.map((e) => {
                const meta = KIND_TH[e.kind] ?? { label: e.kind, tone: 'neutral' as const };
                const sign = e.amountCents >= 0 ? '+' : '−';
                return (
                  <li key={e.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {e.orderId ? (
                          <Link
                            href={`/merchant/orders`}
                            className="text-[11px] text-ink-500 underline"
                          >
                            #{e.orderId.slice(0, 8)}
                          </Link>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-500">{formatDate(e.createdAt)}</p>
                    </div>
                    <span
                      className={
                        e.amountCents >= 0
                          ? 'text-sm font-bold tabular-nums text-emerald-600'
                          : 'text-sm font-bold tabular-nums text-red-600'
                      }
                    >
                      {sign} {formatTHB(Math.abs(e.amountCents))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
