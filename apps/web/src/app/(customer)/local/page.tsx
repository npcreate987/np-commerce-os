'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getCurrentPosition } from '@/lib/native';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Orb } from '@/components/ui/glass';
import {
  ArrowRightIcon,
  ClockIcon,
  MapPinIcon,
  NavigationIcon,
  SearchIcon,
  StoreIcon,
  TruckIcon,
  UtensilsIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

// Bangkok center as default
const DEFAULT_LAT = 13.7563;
const DEFAULT_LNG = 100.5018;

interface Position {
  lat: number;
  lng: number;
  source: 'gps' | 'default';
}

const kindFilters = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'RESTAURANT', label: '🍜 อาหาร' },
  { id: 'CAFE', label: '☕ คาเฟ่' },
  { id: 'GROCERY', label: '🛒 ของชำ' },
  { id: 'FRESH_MARKET', label: '🥬 ของสด' },
  { id: 'LOCAL_GOODS', label: '🎁 ของฝาก' },
  { id: 'SERVICE', label: '🛠 บริการ' },
];

function formatBaht(cents: number): string {
  return `฿${(cents / 100).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

const KIND_LABEL: Record<string, string> = {
  RESTAURANT: 'ร้านอาหาร',
  CAFE: 'คาเฟ่',
  GROCERY: 'ของชำ',
  FRESH_MARKET: 'ของสด',
  LOCAL_GOODS: 'ของฝาก',
  SERVICE: 'บริการ',
};

const KIND_EMOJI: Record<string, string> = {
  RESTAURANT: '🍜',
  CAFE: '☕',
  GROCERY: '🛒',
  FRESH_MARKET: '🥬',
  LOCAL_GOODS: '🎁',
  SERVICE: '🛠',
};

export default function LocalPage(): JSX.Element {
  const [pos, setPos] = useState<Position>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
    source: 'default',
  });
  const [kind, setKind] = useState<string>('all');
  const [radiusKm, setRadiusKm] = useState<number>(10);

  useEffect(() => {
    let cancelled = false;
    void getCurrentPosition({ timeoutMs: 5000, highAccuracy: false }).then(
      (p) => {
        if (cancelled || !p) return;
        setPos({ lat: p.latitude, lng: p.longitude, source: 'gps' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['local', 'nearby', pos.lat, pos.lng, radiusKm, kind],
    queryFn: () =>
      api.local.nearby(pos.lat, pos.lng, radiusKm, kind === 'all' ? undefined : kind),
  });

  return (
    <main className="relative min-h-dvh pb-32">
      <div className="absolute inset-x-0 top-0 -z-10 h-[360px] bg-mesh-soft" aria-hidden />
      <Orb className="left-[-60px] top-[-40px] h-72 w-72 bg-accent-violet/30" />
      <Orb
        className="right-[-40px] top-32 h-56 w-56 bg-brand/30"
        style={{ animationDelay: '-3s' }}
      />

      <header
        className="glass sticky top-0 z-20 border-b border-white/40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <MapPinIcon className="relative h-4 w-4" />
          </div>
          <div className="flex-1 leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              ใกล้ฉัน
            </p>
            <p className="font-display text-sm font-semibold tracking-tight text-ink-900">
              {pos.source === 'gps'
                ? `${pos.lat.toFixed(3)}, ${pos.lng.toFixed(3)}`
                : 'กรุงเทพฯ (ค่าเริ่มต้น)'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((p) => {
                setPos({
                  lat: p.coords.latitude,
                  lng: p.coords.longitude,
                  source: 'gps',
                });
              });
            }}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 backdrop-blur active:scale-95"
            aria-label="ใช้ตำแหน่งของฉัน"
          >
            <NavigationIcon className="h-4 w-4" />
          </button>
          <Link
            href="/search"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 backdrop-blur active:scale-95"
            aria-label="ค้นหา"
          >
            <SearchIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="hide-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          {kindFilters.map((c) => (
            <button
              key={c.id}
              onClick={() => setKind(c.id)}
              className={cn('chip', kind === c.id && 'chip-active')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </header>

      <div className="container-mobile relative pt-5">
        <div className="mb-4 flex items-center justify-between rounded-3xl bg-white/85 px-4 py-3 ring-1 ring-ink-100 shadow-card backdrop-blur">
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              ระยะค้นหา
            </p>
            <p className="font-display text-base font-bold tracking-tight text-ink-900">
              {radiusKm.toFixed(0)} กม.
            </p>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-32"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-3xl" />
            ))}
          </div>
        ) : null}

        {data && data.length === 0 ? (
          <EmptyState
            icon={<StoreIcon />}
            title="ไม่พบร้านในรัศมี"
            description="ลองขยายระยะค้นหา หรือเปลี่ยนหมวด"
          />
        ) : null}

        <div className="space-y-3">
          {data?.map((s) => (
            <Link
              key={s.id}
              href={`/local/${s.shopId}`}
              className="group flex items-center gap-3 rounded-3xl bg-white/95 p-3 shadow-card ring-1 ring-ink-100 backdrop-blur transition active:scale-[0.99]"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
                <span className="text-2xl">{KIND_EMOJI[s.kind] ?? '🏪'}</span>
              </div>
              <div className="flex-1 leading-tight">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                    {KIND_LABEL[s.kind] ?? s.kind}
                  </p>
                  {s.distanceKm != null ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand">
                      <NavigationIcon className="h-2.5 w-2.5" />
                      {s.distanceKm.toFixed(1)} กม.
                    </span>
                  ) : null}
                </div>
                <h3 className="font-display text-base font-bold tracking-tight text-ink-900">
                  {s.shopName ?? 'ร้านท้องถิ่น'}
                </h3>
                <p className="line-clamp-1 text-[11px] text-ink-500">{s.addressText}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.deliveryEnabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-700">
                      <TruckIcon className="h-2.5 w-2.5" />
                      ส่ง {formatBaht(s.baseDeliveryCents)}
                    </span>
                  ) : null}
                  {s.pickupEnabled ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-700">
                      <StoreIcon className="h-2.5 w-2.5" />
                      รับเอง
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-semibold text-ink-700">
                    <ClockIcon className="h-2.5 w-2.5" />
                    {s.prepTimeMinutes} นาที
                  </span>
                </div>
              </div>
              <ArrowRightIcon className="h-4 w-4 text-ink-400 transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
