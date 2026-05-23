'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatTHB } from '@/lib/format';
import {
  ChartIcon,
  ChevronRightIcon,
  LinkIcon,
  MegaphoneIcon,
  SparklesIcon,
  TrendingUpIcon,
  WalletIcon,
} from '@/components/icons';

export default function CreatorDashboardPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  const profileQuery = useQuery({
    queryKey: ['creator', 'me'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.creators.me(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (profileQuery.isSuccess && !profileQuery.data) {
      router.replace('/apply-creator');
    }
  }, [profileQuery.isSuccess, profileQuery.data, router]);

  const statsQuery = useQuery({
    queryKey: ['creator', 'stats'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.creators.myStats(token);
    },
    enabled: Boolean(token) && Boolean(profileQuery.data),
  });

  const linksQuery = useQuery({
    queryKey: ['creator', 'links'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.creators.myLinks(token);
    },
    enabled: Boolean(token) && Boolean(profileQuery.data),
  });

  if (profileQuery.isLoading) {
    return (
      <main className="container-mobile pt-4">
        <Skeleton className="h-32" />
      </main>
    );
  }
  if (!profileQuery.data) return <main />; // redirect in effect

  const p = profileQuery.data;
  const s = statsQuery.data;
  const links = linksQuery.data ?? [];

  const conversionRate =
    s && s.totalClicks > 0 ? ((s.totalConversions / s.totalClicks) * 100).toFixed(1) : '0.0';

  return (
    <main className="container-mobile space-y-4 pt-4">
      {/* Hero earnings card */}
      <section className="relative overflow-hidden rounded-3xl bg-mesh-2 p-6 text-white shadow-pop">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-fuchsia-400/40 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <Badge tone="brand" className="bg-white/15 text-white">
              {p.status === 'ACTIVE' ? 'ACTIVE' : p.status}
            </Badge>
            <span className="text-[11px] text-white/70">
              ค่าคอม default {(p.defaultCommissionBps / 100).toFixed(1)}%
            </span>
          </div>
          <p className="mt-3 text-xs uppercase tracking-wider text-white/70">รายได้สะสมรวม</p>
          <p className="mt-0.5 font-display text-4xl font-extrabold tracking-tight">
            {s ? formatTHB(s.releasedCommissionCents) : '—'}
          </p>
          <p className="mt-1 text-xs text-white/80">
            สวัสดี <span className="font-semibold text-white">{p.displayName}</span>
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-white/70">รอปล่อย</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">
                {s ? formatTHB(s.pendingCommissionCents) : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-white/70">ยอดขายผ่านลิงก์</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">
                {s ? formatTHB(s.totalSalesCents) : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-2">
              <p className="text-white/70">Conversion</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">{conversionRate}%</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats grid */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white p-3 shadow-card">
          <LinkIcon className="h-4 w-4 text-brand" />
          <p className="mt-1 text-[11px] text-ink-500">ลิงก์ทั้งหมด</p>
          <p className="text-base font-bold tabular-nums text-ink-900">
            {s ? s.totalLinks : '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-card">
          <TrendingUpIcon className="h-4 w-4 text-emerald-600" />
          <p className="mt-1 text-[11px] text-ink-500">คลิก</p>
          <p className="text-base font-bold tabular-nums text-ink-900">
            {s ? s.totalClicks : '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-card">
          <ChartIcon className="h-4 w-4 text-fuchsia-600" />
          <p className="mt-1 text-[11px] text-ink-500">ออเดอร์</p>
          <p className="text-base font-bold tabular-nums text-ink-900">
            {s ? s.totalConversions : '—'}
          </p>
        </div>
      </section>

      {/* Actions */}
      <section className="rounded-3xl border border-ink-100 bg-white p-2 shadow-card">
        <Link
          href="/creator/links"
          className="flex items-center justify-between rounded-2xl px-3 py-3 active:bg-ink-50"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand">
              <LinkIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">จัดการลิงก์ของฉัน</p>
              <p className="text-[11px] text-ink-500">สร้างใหม่ / ดู QR / ดูสถิติ</p>
            </div>
          </div>
          <ChevronRightIcon className="h-4 w-4 text-ink-300" />
        </Link>
        <Link
          href="/creator/wallet"
          className="flex items-center justify-between rounded-2xl px-3 py-3 active:bg-ink-50"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <WalletIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">รายได้ของฉัน</p>
              <p className="text-[11px] text-ink-500">ดูประวัติคอมมิชชั่นและถอนเงิน</p>
            </div>
          </div>
          <ChevronRightIcon className="h-4 w-4 text-ink-300" />
        </Link>
      </section>

      {/* Latest links */}
      <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-900">ลิงก์ล่าสุด</h2>
          {links.length > 0 && (
            <Link href="/creator/links" className="text-xs font-semibold text-brand">
              ดูทั้งหมด →
            </Link>
          )}
        </div>
        {linksQuery.isLoading ? (
          <Skeleton className="h-20" />
        ) : links.length === 0 ? (
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-fuchsia-50 p-6 text-center">
            <MegaphoneIcon className="mx-auto h-7 w-7 text-brand" />
            <p className="mt-2 text-sm font-bold text-ink-900">เริ่มสร้างลิงก์แรกของคุณ</p>
            <p className="mt-1 text-[11px] text-ink-500">
              เลือกสินค้าที่ชอบ → ได้ลิงก์สั้น + QR ไปใส่ใน TikTok/IG ได้เลย
            </p>
            <Link
              href="/creator/links"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              <SparklesIcon className="h-3.5 w-3.5" /> สร้างลิงก์เลย
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {links.slice(0, 3).map((l) => (
              <li key={l.id}>
                <Link
                  href={`/creator/links/${l.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 active:bg-ink-50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand">
                    <LinkIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink-900">
                      {l.label ?? `ลิงก์ ${l.code}`}
                    </p>
                    <p className="text-[11px] text-ink-500">
                      {l.clickCount} คลิก · {l.conversionCount} ออเดอร์
                    </p>
                  </div>
                  <code className="rounded bg-ink-50 px-2 py-0.5 text-[10px] font-mono text-ink-600">
                    /r/{l.code}
                  </code>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
