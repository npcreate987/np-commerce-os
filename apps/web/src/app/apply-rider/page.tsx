'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import {
  BikeIcon,
  ChevronLeftIcon,
  SparklesIcon,
  TruckIcon,
  WalletIcon,
} from '@/components/icons';

const VEHICLES = [
  { id: 'MOTORCYCLE', label: 'มอเตอร์ไซค์', emoji: '🛵' },
  { id: 'BIKE', label: 'จักรยาน', emoji: '🚲' },
  { id: 'CAR', label: 'รถยนต์', emoji: '🚗' },
] as const;

type Vehicle = (typeof VEHICLES)[number]['id'];

export default function ApplyRiderPage(): JSX.Element {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [vehicle, setVehicle] = useState<Vehicle>('MOTORCYCLE');
  const [err, setErr] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ['rider', 'me'],
    queryFn: () => api.riders.me(token!),
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (profileQuery.data) router.replace('/rider/dashboard');
  }, [profileQuery.data, router]);

  const apply = useMutation({
    mutationFn: () => api.riders.apply(token!, { vehicle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rider', 'me'] });
      router.push('/rider/dashboard');
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'สมัครไม่สำเร็จ'),
  });

  return (
    <main className="relative min-h-dvh pb-20">
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-mesh-2" aria-hidden />
      <div className="container-mobile pt-4">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-white/90"
        >
          <ChevronLeftIcon className="h-3 w-3" />
          กลับ
        </Link>

        <header className="mt-4 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
            <BikeIcon className="h-5 w-5" />
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tightest">
            สมัครเป็น Rider
          </h1>
          <p className="text-[12px] text-white/85">
            รับงานส่งของในพื้นที่ — กำหนดเวลาออนไลน์เอง
          </p>
        </header>
      </div>

      <div className="container-mobile mt-6 space-y-4">
        {/* Benefits */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur">
            <SparklesIcon className="h-4 w-4 text-brand" />
            <p className="mt-1 text-[11px] font-semibold text-ink-700">งานยืดหยุ่น</p>
            <p className="text-[10px] text-ink-500">ออนไลน์/ออฟไลน์เมื่อพร้อม</p>
          </div>
          <div className="rounded-2xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur">
            <TruckIcon className="h-4 w-4 text-brand" />
            <p className="mt-1 text-[11px] font-semibold text-ink-700">งานในพื้นที่</p>
            <p className="text-[10px] text-ink-500">เห็นงานใกล้ตัวก่อน</p>
          </div>
          <div className="rounded-2xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur">
            <WalletIcon className="h-4 w-4 text-brand" />
            <p className="mt-1 text-[11px] font-semibold text-ink-700">รายได้เข้าทันที</p>
            <p className="text-[10px] text-ink-500">เก็บใน NP Wallet</p>
          </div>
        </div>

        {/* Vehicle picker */}
        <div className="rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            เลือกยานพาหนะ
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {VEHICLES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVehicle(v.id)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 transition ${
                  vehicle === v.id
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'bg-ink-50 text-ink-700 ring-1 ring-ink-100'
                }`}
              >
                <span className="text-2xl">{v.emoji}</span>
                <span className="text-[11px] font-semibold">{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {err ? (
          <div className="rounded-2xl bg-rose-50 p-3 text-[12px] text-rose-700 ring-1 ring-rose-200">
            {err}
          </div>
        ) : null}

        <Button
          className="w-full"
          onClick={() => apply.mutate()}
          disabled={apply.isPending || !token}
        >
          {apply.isPending ? 'กำลังสมัคร...' : 'สมัครเป็น Rider'}
        </Button>

        {!token ? (
          <div className="rounded-2xl bg-amber-50 p-3 text-[12px] text-amber-800 ring-1 ring-amber-200">
            เข้าสู่ระบบก่อนสมัคร —{' '}
            <Link href="/login" className="font-semibold underline">
              ล็อกอิน
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
