'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTHB } from '@/lib/format';
import {
  ArrowRightIcon,
  BagIcon,
  PackageIcon,
  PlusIcon,
  ShieldCheckIcon,
  StoreIcon,
  WalletIcon,
} from '@/components/icons';

export default function MerchantDashboardPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [shopName, setShopName] = useState('');
  const [shopSlug, setShopSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: shops, isLoading } = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.shops.mine(token);
    },
    enabled: Boolean(token),
  });

  const createShop = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.shops.create(token, { name: shopName, slug: shopSlug });
    },
    onSuccess: () => {
      setShopName('');
      setShopSlug('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['shops', 'mine'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'สร้างร้านไม่สำเร็จ'),
  });

  const shop = shops?.[0];
  const ordersQuery = useQuery({
    queryKey: ['orders', 'shop', shop?.id],
    queryFn: () => {
      if (!token || !shop) throw new Error('NO_SHOP');
      return api.orders.byShop(token, shop.id);
    },
    enabled: Boolean(token && shop),
  });

  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.wallet.mine(token);
    },
    enabled: Boolean(token),
  });

  const disputesQuery = useQuery({
    queryKey: ['disputes', 'shop', shop?.id],
    queryFn: () => {
      if (!token || !shop) throw new Error('NO_SHOP');
      return api.disputes.forShop(token, shop.id);
    },
    enabled: Boolean(token && shop),
  });

  function onCreate(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    createShop.mutate();
  }

  if (isLoading) {
    return (
      <main className="container-mobile space-y-3 py-6">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="container-mobile py-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
          <StoreIcon className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">เปิดร้านของคุณ</h1>
        <p className="mt-1 text-sm text-ink-500">ฟรี · ไม่มีค่าธรรมเนียมรายเดือน</p>

        <form
          onSubmit={onCreate}
          className="mt-6 space-y-4 rounded-3xl border border-ink-100 bg-white p-4 shadow-card"
        >
          <Input
            label="ชื่อร้าน"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="เช่น Korea Beauty Hub"
            required
          />
          <Input
            label="ชื่อย่อ (URL)"
            value={shopSlug}
            onChange={(e) =>
              setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
            }
            hint="a-z, 0-9, ขีดกลาง · ใช้เป็นลิงก์ร้านคุณ"
            placeholder="my-shop"
            required
          />
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">{error}</p>
            </div>
          ) : null}
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={createShop.isPending}
            rightIcon={!createShop.isPending ? <ArrowRightIcon className="h-4 w-4" /> : undefined}
          >
            สร้างร้าน
          </Button>
        </form>
      </main>
    );
  }

  const orders = ordersQuery.data ?? [];
  const totalRevenue = orders
    .filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
    .reduce((sum, o) => sum + o.totalCents, 0);
  const pendingCount = orders.filter(
    (o) => o.status === 'PAID' || o.status === 'READY_TO_SHIP',
  ).length;
  const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;

  const openDisputes = (disputesQuery.data ?? []).filter(
    (d) => d.status === 'OPEN' || d.status === 'MERCHANT_REPLIED',
  ).length;

  return (
    <main className="pb-28">
      <header
        className="relative overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-700 pb-8 pt-8 text-white shadow-pop"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/45 blur-3xl" aria-hidden />
        <div className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-accent-violet/40 blur-3xl" aria-hidden />
        <div className="absolute inset-0 bg-noise opacity-25 mix-blend-overlay" aria-hidden />
        <div className="container-mobile relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                ร้านของคุณ
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tightest">
                {shop.name}
              </h1>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white ring-1 ring-white/20 backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  {shop.status}
                </span>
                <span className="text-xs text-white/80">/{shop.slug}</span>
              </div>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <StoreIcon className="h-6 w-6" />
            </div>
          </div>
        </div>
      </header>

      <div className="container-mobile -mt-4 space-y-4">
        {/* KPI cards */}
        <section className="grid grid-cols-3 gap-2">
          <KpiCard label="ยอดขาย" value={formatTHB(totalRevenue)} accent />
          <KpiCard label="รอส่ง" value={String(pendingCount)} />
          <KpiCard label="สำเร็จ" value={String(completedCount)} />
        </section>

        {/* Wallet hero */}
        <Link
          href="/merchant/wallet"
          className="relative block overflow-hidden rounded-3xl bg-mesh-2 p-4 text-white shadow-pop active:scale-[0.99]"
        >
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-white/80">
                <WalletIcon className="h-4 w-4" />
                <p className="text-[10px] uppercase tracking-wider">ยอดพร้อมถอน</p>
              </div>
              <p className="mt-0.5 font-display text-2xl font-bold tabular-nums">
                {formatTHB(walletQuery.data?.availableCents ?? 0)}
              </p>
              <p className="mt-0.5 text-[11px] text-white/80">
                Escrow {formatTHB(walletQuery.data?.pendingCents ?? 0)}
              </p>
            </div>
            <ArrowRightIcon className="h-5 w-5 text-white/80" />
          </div>
        </Link>

        {/* Quick actions */}
        <section className="grid grid-cols-2 gap-3">
          <Link
            href="/merchant/products"
            className="flex items-center gap-3 rounded-3xl border border-ink-100 bg-white p-3 shadow-card active:scale-[0.985]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand">
              <BagIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">สินค้า</p>
              <p className="text-[11px] text-ink-500">จัดการคลัง</p>
            </div>
          </Link>
          <Link
            href="/merchant/orders"
            className="flex items-center gap-3 rounded-3xl border border-ink-100 bg-white p-3 shadow-card active:scale-[0.985]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <PackageIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">ออเดอร์</p>
              <p className="text-[11px] text-ink-500">{orders.length} รายการ</p>
            </div>
          </Link>
          <Link
            href="/merchant/disputes"
            className="flex items-center gap-3 rounded-3xl border border-ink-100 bg-white p-3 shadow-card active:scale-[0.985]"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <ShieldCheckIcon className="h-5 w-5" />
              {openDisputes > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                  {openDisputes}
                </span>
              ) : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">ข้อพิพาท</p>
              <p className="text-[11px] text-ink-500">
                {openDisputes > 0 ? `${openDisputes} ต้องตอบ` : 'ไม่มี'}
              </p>
            </div>
          </Link>
          <Link
            href="/merchant/wallet"
            className="flex items-center gap-3 rounded-3xl border border-ink-100 bg-white p-3 shadow-card active:scale-[0.985]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <WalletIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">กระเป๋าเงิน</p>
              <p className="text-[11px] text-ink-500">รายการเงินเข้า-ออก</p>
            </div>
          </Link>
        </section>

        {/* Recent orders */}
        <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">ออเดอร์ล่าสุด</h2>
            <Link
              href="/merchant/orders"
              className="text-xs font-semibold text-brand hover:text-brand-700"
            >
              ดูทั้งหมด
            </Link>
          </div>
          {orders.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-400">ยังไม่มีออเดอร์</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {orders.slice(0, 5).map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        o.status === 'COMPLETED'
                          ? 'success'
                          : o.status === 'PAID'
                            ? 'info'
                            : o.status === 'CANCELLED' || o.status === 'REFUNDED'
                              ? 'danger'
                              : 'warning'
                      }
                    >
                      {o.status}
                    </Badge>
                    <span className="text-xs text-ink-500">#{o.id.slice(0, 6)}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-ink-900">
                    {formatTHB(o.totalCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* CTA: add product */}
        <Link
          href="/merchant/products/new"
          className="flex items-center justify-between rounded-3xl bg-ink-900 p-4 text-white shadow-pop active:scale-[0.99]"
        >
          <div>
            <p className="text-sm font-bold">เพิ่มสินค้าใหม่</p>
            <p className="text-[11px] text-ink-300">เริ่มลงสินค้าเลย</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <PlusIcon className="h-5 w-5" />
          </div>
        </Link>
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-3 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p
        className={`mt-1 text-base font-bold tracking-tight tabular-nums ${
          accent ? 'text-brand' : 'text-ink-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
