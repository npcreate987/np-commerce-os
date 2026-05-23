'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowRightIcon,
  CalendarIcon,
  ListIcon,
  MapPinIcon,
  StoreIcon,
} from '@/components/icons';

const KIND_OPTIONS = [
  { id: 'RESTAURANT', label: 'ร้านอาหาร' },
  { id: 'CAFE', label: 'คาเฟ่' },
  { id: 'GROCERY', label: 'ของชำ' },
  { id: 'FRESH_MARKET', label: 'ของสด' },
  { id: 'LOCAL_GOODS', label: 'ของฝาก / ของทั่วไป' },
  { id: 'SERVICE', label: 'บริการ' },
];

export default function MerchantLocalListPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const { data: shops, isLoading } = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.shops.mine(token);
    },
    enabled: Boolean(token),
  });

  return (
    <main className="container-mobile space-y-4 pt-4">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          NP Local Commerce
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
          ตั้งค่าหน้าร้านท้องถิ่น
        </h1>
        <p className="text-[12px] text-ink-600">
          เปิดให้ลูกค้าเจอร้านผ่าน "ใกล้ฉัน" สั่งของส่งด่วน หรือนัดรับเอง
        </p>
      </header>

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-3xl" />
      ) : null}

      {shops && shops.length === 0 ? (
        <EmptyState
          icon={<StoreIcon />}
          title="ยังไม่มีร้าน"
          description="สมัครร้านในแดชบอร์ดก่อน"
          action={
            <Link
              href="/merchant/dashboard"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 text-xs font-semibold text-white shadow-glow"
            >
              ไปแดชบอร์ด
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          }
        />
      ) : null}

      <div className="space-y-3">
        {shops?.map((shop) => (
          <ShopLocalCard key={shop.id} shopId={shop.id} shopName={shop.name} />
        ))}
      </div>
    </main>
  );
}

function ShopLocalCard({
  shopId,
  shopName,
}: {
  shopId: string;
  shopName: string;
}): JSX.Element {
  const { data: store } = useQuery({
    queryKey: ['local', 'store', shopId],
    queryFn: () => api.local.getStore(shopId),
  });

  return (
    <div className="rounded-3xl bg-white/95 p-4 shadow-card ring-1 ring-ink-100 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">
            {shopName}
          </h2>
          {store ? (
            <p className="mt-1 text-[12px] text-ink-600">
              <MapPinIcon className="inline h-3 w-3" /> {store.addressText}
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-amber-600">
              ยังไม่ได้ตั้งค่าหน้าร้านท้องถิ่น
            </p>
          )}
        </div>
        <Link
          href={`/merchant/local/${shopId}`}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-full bg-brand-gradient px-4 text-xs font-semibold text-white shadow-glow"
        >
          {store ? 'แก้ไข' : 'ตั้งค่า'}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
      {store ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={`/merchant/local/${shopId}/menu`}
            className="flex items-center gap-2 rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-100"
          >
            <ListIcon className="h-4 w-4 text-brand" />
            <span className="text-[12px] font-semibold text-ink-800">หมวดเมนู</span>
          </Link>
          <Link
            href={`/merchant/local/${shopId}/slots`}
            className="flex items-center gap-2 rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-100"
          >
            <CalendarIcon className="h-4 w-4 text-brand" />
            <span className="text-[12px] font-semibold text-ink-800">ช่วงเวลา</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
