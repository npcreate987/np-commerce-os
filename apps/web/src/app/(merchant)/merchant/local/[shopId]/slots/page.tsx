'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CalendarIcon,
  ChevronLeftIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

function localISO(date: Date): string {
  // YYYY-MM-DDTHH:MM (datetime-local format)
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export default function MerchantSlotsPage(): JSX.Element {
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [kind, setKind] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');

  // Form state for new slot
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const end = new Date(now);
  end.setHours(end.getHours() + 1);
  const [startsAt, setStartsAt] = useState(localISO(now));
  const [endsAt, setEndsAt] = useState(localISO(end));
  const [capacity, setCapacity] = useState<number>(5);

  const { data: slots, isLoading } = useQuery({
    queryKey: ['local', 'slots', shopId, kind],
    queryFn: () => api.local.slots(shopId, kind),
  });

  const createSlot = useMutation({
    mutationFn: () =>
      api.local.createSlot(token!, shopId, {
        kind,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        capacity,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local', 'slots', shopId] }),
  });

  const deleteSlot = useMutation({
    mutationFn: (slotId: string) => api.local.deleteSlot(token!, shopId, slotId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local', 'slots', shopId] }),
  });

  function submit(e: FormEvent): void {
    e.preventDefault();
    createSlot.mutate();
  }

  return (
    <main className="container-mobile space-y-4 pb-32 pt-2">
      <Link
        href={`/merchant/local/${shopId}`}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-600"
      >
        <ChevronLeftIcon className="h-3 w-3" />
        กลับ
      </Link>

      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
          ช่วงเวลานัดรับ / นัดส่ง
        </h1>
        <p className="text-[12px] text-ink-600">
          กำหนดช่วงที่เปิดให้ลูกค้าจอง — แต่ละช่วงรับได้ตาม capacity
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/85 p-1.5 ring-1 ring-ink-100 backdrop-blur">
        {(['DELIVERY', 'PICKUP'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              'rounded-xl px-3 py-2 text-xs font-semibold transition',
              kind === k
                ? 'bg-brand-gradient text-white shadow-glow'
                : 'text-ink-600',
            )}
          >
            {k === 'DELIVERY' ? '🛵 ส่งให้' : '🛍 รับเอง'}
          </button>
        ))}
      </div>

      <form
        onSubmit={submit}
        className="space-y-3 rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          เพิ่มช่วงเวลาใหม่ ({kind === 'DELIVERY' ? 'ส่งให้' : 'รับเอง'})
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              เริ่ม
            </label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-[12px]"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              สิ้นสุด
            </label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-[12px]"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            รับได้ (capacity)
          </label>
          <Input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            min={1}
            max={200}
          />
        </div>
        <Button type="submit" className="w-full" disabled={createSlot.isPending}>
          <PlusIcon className="h-3.5 w-3.5" />
          เพิ่มช่วงเวลา
        </Button>
      </form>

      {isLoading ? <Skeleton className="h-24 w-full rounded-3xl" /> : null}

      {slots && slots.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon />}
          title="ยังไม่มีช่วงเวลา"
          description="เพิ่มช่วงแรกได้จากฟอร์มด้านบน"
        />
      ) : null}

      <div className="space-y-2">
        {slots?.map((s) => {
          const starts = new Date(s.startsAt);
          const ends = new Date(s.endsAt);
          return (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-white/95 p-3 ring-1 ring-ink-100 shadow-card backdrop-blur"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                  {starts.toLocaleDateString('th-TH', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
                <p className="font-display text-base font-bold tracking-tight text-ink-900">
                  {starts.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' – '}
                  {ends.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-[11px] text-ink-500">
                  ใช้ไปแล้ว {s.taken}/{s.capacity}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteSlot.mutate(s.id)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
