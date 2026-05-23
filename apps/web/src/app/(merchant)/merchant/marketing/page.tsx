'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ChevronRightIcon,
  FlameIcon,
  MegaphoneIcon,
  StoreIcon,
  TicketIcon,
  VideoIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

export default function MerchantMarketingHubPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const shopsQ = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => api.shops.mine(token!),
    enabled: !!token,
  });

  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  const shops = shopsQ.data ?? [];
  const currentShopId = activeShopId ?? shops[0]?.id ?? null;

  if (shopsQ.isLoading) {
    return (
      <main className="container-mobile space-y-3 py-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </main>
    );
  }

  if (shops.length === 0) {
    return (
      <main className="container-mobile py-6">
        <EmptyState
          title="ยังไม่มีร้าน"
          description="สร้างร้านก่อน ค่อยเริ่มทำการตลาด"
          icon={<StoreIcon className="h-8 w-8 text-ink-300" />}
          action={
            <Link
              href="/merchant/dashboard"
              className="rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              ไปแดชบอร์ด
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="container-mobile space-y-4 pb-20 pt-4">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand">
          Marketing Engine
        </p>
        <h1 className="text-xl font-bold text-ink-900">เครื่องมือการตลาด</h1>
        <p className="text-xs text-ink-500">
          คูปอง · Flash Deal · Broadcast · Short Video — เพิ่มยอดขายอัตโนมัติ
        </p>
      </header>

      {shops.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shops.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveShopId(s.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                s.id === currentShopId
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'bg-white text-ink-700 ring-1 ring-ink-200',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3">
        <ToolCard
          href={`/merchant/marketing/coupons?shopId=${currentShopId}`}
          icon={<TicketIcon className="h-5 w-5" />}
          title="คูปอง"
          desc="สร้างโค้ดส่วนลด PERCENT / FIXED / ส่งฟรี"
          gradient="from-brand to-fuchsia-500"
        />
        <ToolCard
          href={`/merchant/marketing/campaigns?shopId=${currentShopId}`}
          icon={<FlameIcon className="h-5 w-5" />}
          title="Flash Deal & Boost"
          desc="แคมเปญลดราคาตามช่วงเวลา · เพิ่ม visibility"
          gradient="from-orange-500 to-rose-500"
        />
        <ToolCard
          href={`/merchant/marketing/broadcasts?shopId=${currentShopId}`}
          icon={<MegaphoneIcon className="h-5 w-5" />}
          title="Broadcast"
          desc="ส่ง in-app / push ถึงลูกค้าเก่า ลูกค้าเป้าหมาย"
          gradient="from-sky-500 to-emerald-500"
        />
        <ToolCard
          href={`/merchant/marketing/videos?shopId=${currentShopId}`}
          icon={<VideoIcon className="h-5 w-5" />}
          title="Short Video"
          desc="ลงคลิปสั้นพร้อมแท็กสินค้า ดันใน Feed"
          gradient="from-violet-500 to-indigo-500"
        />
      </div>
    </main>
  );
}

function ToolCard({
  href,
  icon,
  title,
  desc,
  gradient,
}: {
  href: string;
  icon: JSX.Element;
  title: string;
  desc: string;
  gradient: string;
}): JSX.Element {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-100 transition active:scale-[0.99]"
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-glow',
          gradient,
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <p className="mt-0.5 text-[11px] text-ink-500">{desc}</p>
      </div>
      <ChevronRightIcon className="h-4 w-4 text-ink-300" />
    </Link>
  );
}
