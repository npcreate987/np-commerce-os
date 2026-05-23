'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowRightIcon,
  BikeIcon,
  MapPinIcon,
  NavigationIcon,
  TruckIcon,
  WalletIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

function formatBaht(cents: number): string {
  return `฿${(cents / 100).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

const ONLINE_LABEL: Record<string, string> = {
  AVAILABLE: 'ออนไลน์',
  BUSY: 'กำลังส่ง',
  OFFLINE: 'ออฟไลน์',
};

export default function RiderDashboardPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: rider, isLoading } = useQuery({
    queryKey: ['rider', 'me'],
    queryFn: () => api.riders.me(token!),
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (rider === null) router.replace('/apply-rider');
  }, [rider, router]);

  const { data: openJobs } = useQuery({
    queryKey: ['rider', 'open-jobs'],
    queryFn: () => api.riders.openJobs(token!),
    enabled: Boolean(token) && rider?.online === 'AVAILABLE',
    refetchInterval: 8000,
  });

  const { data: myJobs } = useQuery({
    queryKey: ['rider', 'my-jobs'],
    queryFn: () => api.riders.myJobs(token!),
    enabled: Boolean(token),
    refetchInterval: 8000,
  });

  const toggleOnline = useMutation({
    mutationFn: async (online: 'AVAILABLE' | 'OFFLINE') => {
      if (online === 'OFFLINE') {
        return api.riders.updateLocation(token!, {
          lat: rider?.lat ?? 13.7563,
          lng: rider?.lng ?? 100.5018,
          online,
        });
      }
      // When going online, fetch current location
      return new Promise<typeof rider>((resolve, reject) => {
        if (!navigator.geolocation) {
          api.riders
            .updateLocation(token!, { lat: 13.7563, lng: 100.5018, online })
            .then(resolve, reject);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (p) => {
            api.riders
              .updateLocation(token!, {
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                online,
              })
              .then(resolve, reject);
          },
          () => {
            api.riders
              .updateLocation(token!, { lat: 13.7563, lng: 100.5018, online })
              .then(resolve, reject);
          },
        );
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rider', 'me'] });
      qc.invalidateQueries({ queryKey: ['rider', 'open-jobs'] });
    },
  });

  const accept = useMutation({
    mutationFn: (jobId: string) => api.riders.accept(token!, jobId),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ['rider', 'open-jobs'] });
      qc.invalidateQueries({ queryKey: ['rider', 'my-jobs'] });
      qc.invalidateQueries({ queryKey: ['rider', 'me'] });
      router.push(`/rider/jobs/${job.id}`);
    },
  });

  if (isLoading) {
    return (
      <main className="container-mobile py-6">
        <Skeleton className="h-44 w-full rounded-3xl" />
      </main>
    );
  }
  if (!rider) {
    return (
      <main className="container-mobile py-6">
        <Skeleton className="h-44 w-full rounded-3xl" />
      </main>
    );
  }

  const isOnline = rider.online !== 'OFFLINE';
  const activeJobs = (myJobs ?? []).filter(
    (j) => j.status === 'ASSIGNED' || j.status === 'PICKED_UP',
  );

  return (
    <main className="container-mobile space-y-4 pb-32 pt-2">
      {/* Status card */}
      <div className="overflow-hidden rounded-3xl bg-ink-900 p-5 text-white shadow-pop noise">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <BikeIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 leading-tight">
            <p className="text-[10px] uppercase tracking-wider text-white/70">
              สถานะ
            </p>
            <p className="font-display text-xl font-bold tracking-tight">
              {ONLINE_LABEL[rider.online] ?? rider.online}
            </p>
            <p className="text-[11px] text-white/70">
              {rider.vehicle === 'MOTORCYCLE'
                ? 'มอเตอร์ไซค์'
                : rider.vehicle === 'BIKE'
                  ? 'จักรยาน'
                  : 'รถยนต์'}
              {' · '}
              {rider.totalDeliveries} ออเดอร์ส่งสำเร็จ
            </p>
          </div>
          <button
            type="button"
            disabled={toggleOnline.isPending || rider.online === 'BUSY'}
            onClick={() => toggleOnline.mutate(isOnline ? 'OFFLINE' : 'AVAILABLE')}
            className={cn(
              'rounded-full px-4 py-2 text-[12px] font-semibold transition',
              isOnline
                ? 'bg-white/10 text-white ring-1 ring-white/30'
                : 'bg-brand text-white shadow-glow',
            )}
          >
            {isOnline ? 'ออฟไลน์' : 'เริ่มงาน'}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur">
            <p className="text-[10px] uppercase tracking-wider text-white/70">
              รายได้รวม
            </p>
            <p className="font-display text-base font-bold">
              {formatBaht(rider.totalEarningsCents)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur">
            <p className="text-[10px] uppercase tracking-wider text-white/70">
              งานที่ทำอยู่
            </p>
            <p className="font-display text-base font-bold">{activeJobs.length}</p>
          </div>
        </div>
      </div>

      {/* Active jobs */}
      {activeJobs.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-lg font-bold tracking-tight text-ink-900">
            งานที่กำลังทำ
          </h2>
          <div className="space-y-2">
            {activeJobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Open jobs */}
      <section>
        <h2 className="mb-2 font-display text-lg font-bold tracking-tight text-ink-900">
          งานเปิดรับ {isOnline ? '' : '(ออนไลน์ก่อนเพื่อรับงาน)'}
        </h2>
        {!isOnline ? (
          <EmptyState
            icon={<BikeIcon />}
            title="คุณอยู่ในสถานะออฟไลน์"
            description="กดเริ่มงานเพื่อดูงานในพื้นที่"
          />
        ) : openJobs && openJobs.length === 0 ? (
          <EmptyState
            icon={<TruckIcon />}
            title="ยังไม่มีงาน"
            description="ระบบจะอัปเดตเมื่อมีออเดอร์ใหม่"
          />
        ) : null}

        <div className="space-y-2">
          {openJobs?.map((j) => (
            <div
              key={j.id}
              className="rounded-2xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                    {j.distanceKm.toFixed(1)} กม.
                  </p>
                  <p className="font-display text-sm font-bold tracking-tight text-ink-900">
                    {formatBaht(j.riderFeeCents)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => accept.mutate(j.id)}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-full bg-brand-gradient px-4 text-[12px] font-semibold text-white shadow-glow"
                  disabled={accept.isPending}
                >
                  รับงาน
                  <ArrowRightIcon className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-ink-700">
                <div className="flex items-start gap-1">
                  <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-50 text-[9px] font-bold text-brand">
                    A
                  </span>
                  <span className="line-clamp-1">{j.pickupText}</span>
                </div>
                <div className="flex items-start gap-1">
                  <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-100 text-[9px] font-bold text-ink-700">
                    B
                  </span>
                  <span className="line-clamp-1">{j.dropText}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function JobCard({
  job,
}: {
  job: {
    id: string;
    status: string;
    pickupText: string;
    dropText: string;
    distanceKm: number;
    riderFeeCents: number;
  };
}): JSX.Element {
  return (
    <Link
      href={`/rider/jobs/${job.id}`}
      className="block rounded-2xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
            {job.status === 'ASSIGNED' ? 'รับแล้ว — ไปรับของ' : 'กำลังส่ง'}
          </p>
          <p className="font-display text-sm font-bold tracking-tight text-ink-900">
            {`฿${(job.riderFeeCents / 100).toLocaleString('th-TH')}`} · {job.distanceKm.toFixed(1)} กม.
          </p>
        </div>
        <ArrowRightIcon className="h-4 w-4 text-ink-400" />
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-ink-700">
        <div className="flex items-start gap-1">
          <MapPinIcon className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
          <span className="line-clamp-1">{job.pickupText}</span>
        </div>
        <div className="flex items-start gap-1">
          <NavigationIcon className="mt-0.5 h-3 w-3 shrink-0 text-ink-500" />
          <span className="line-clamp-1">{job.dropText}</span>
        </div>
      </div>
    </Link>
  );
}
