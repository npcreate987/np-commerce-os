'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  MapPinIcon,
  NavigationIcon,
  TruckIcon,
} from '@/components/icons';

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'ค้นหาผู้รับงาน',
  ASSIGNED: 'รับแล้ว — ไปรับของ',
  PICKED_UP: 'รับของแล้ว — กำลังส่ง',
  DELIVERED: 'ส่งสำเร็จ',
  FAILED: 'ส่งไม่สำเร็จ',
  CANCELLED: 'ยกเลิก',
};

function formatBaht(cents: number): string {
  return `฿${(cents / 100).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

export default function RiderJobDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const qc = useQueryClient();

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['rider', 'my-jobs'],
    queryFn: () => api.riders.myJobs(token!),
    enabled: Boolean(token),
    refetchInterval: 6000,
  });
  const job = jobs?.find((j) => j.id === jobId);

  const pickup = useMutation({
    mutationFn: () => api.riders.pickup(token!, jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rider', 'my-jobs'] }),
  });
  const deliver = useMutation({
    mutationFn: () => api.riders.deliver(token!, jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rider', 'my-jobs'] });
      qc.invalidateQueries({ queryKey: ['rider', 'me'] });
      router.replace('/rider/dashboard');
    },
  });

  if (isLoading) {
    return (
      <main className="container-mobile py-6">
        <Skeleton className="h-72 w-full rounded-3xl" />
      </main>
    );
  }
  if (!job) {
    return (
      <main className="container-mobile py-6 text-center">
        <p className="text-[14px] text-ink-600">ไม่พบงาน</p>
        <Link
          href="/rider/dashboard"
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand"
        >
          กลับ Dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="container-mobile space-y-4 pb-32 pt-2">
      <Link
        href="/rider/dashboard"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-600"
      >
        <ChevronLeftIcon className="h-3 w-3" />
        กลับ
      </Link>

      <div className="rounded-3xl bg-white/95 p-5 ring-1 ring-ink-100 shadow-pop backdrop-blur">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
          {STATUS_LABEL[job.status] ?? job.status}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900">
          {formatBaht(job.riderFeeCents)}
        </h1>
        <p className="text-[12px] text-ink-600">
          ระยะทาง {job.distanceKm.toFixed(2)} กม.
        </p>

        <div className="mt-4 space-y-3">
          {/* Pickup */}
          <div className="rounded-2xl bg-brand-50 p-3 ring-1 ring-brand-100">
            <div className="flex items-start gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                A
              </span>
              <div className="flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                  จุดรับของ
                </p>
                <p className="font-display text-sm font-semibold text-ink-900">
                  {job.pickupText}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${job.pickupLat},${job.pickupLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand"
                >
                  <NavigationIcon className="h-3 w-3" />
                  เปิดแผนที่
                </a>
              </div>
            </div>
          </div>

          {/* Drop */}
          <div className="rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-100">
            <div className="flex items-start gap-2">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[10px] font-bold text-white">
                B
              </span>
              <div className="flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  จุดส่ง
                </p>
                <p className="font-display text-sm font-semibold text-ink-900">
                  {job.dropText}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${job.dropLat},${job.dropLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-700"
                >
                  <NavigationIcon className="h-3 w-3" />
                  เปิดแผนที่
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action button */}
      {job.status === 'ASSIGNED' ? (
        <Button
          className="w-full"
          onClick={() => pickup.mutate()}
          disabled={pickup.isPending}
        >
          <TruckIcon className="h-4 w-4" />
          ยืนยันรับของแล้ว
        </Button>
      ) : null}
      {job.status === 'PICKED_UP' ? (
        <Button
          className="w-full"
          onClick={() => deliver.mutate()}
          disabled={deliver.isPending}
        >
          <CheckIcon className="h-4 w-4" />
          ยืนยันส่งสำเร็จ
        </Button>
      ) : null}
      {job.status === 'DELIVERED' ? (
        <div className="rounded-2xl bg-emerald-50 p-4 text-center text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <ClockIcon className="mx-auto mb-1 h-5 w-5" />
          ส่งสำเร็จ — เครดิตจะเข้ากระเป๋าโดยอัตโนมัติ
        </div>
      ) : null}
    </main>
  );
}
