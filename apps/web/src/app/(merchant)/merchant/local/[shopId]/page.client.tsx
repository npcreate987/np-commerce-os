'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getCurrentPosition } from '@/lib/native';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeftIcon,
  ClockIcon,
  ListIcon,
  CalendarIcon,
  MapPinIcon,
  NavigationIcon,
} from '@/components/icons';

const KIND_OPTIONS = [
  { id: 'RESTAURANT', label: 'ร้านอาหาร' },
  { id: 'CAFE', label: 'คาเฟ่' },
  { id: 'GROCERY', label: 'ของชำ' },
  { id: 'FRESH_MARKET', label: 'ของสด' },
  { id: 'LOCAL_GOODS', label: 'ของฝาก / ทั่วไป' },
  { id: 'SERVICE', label: 'บริการ' },
] as const;

type Kind = (typeof KIND_OPTIONS)[number]['id'];

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABEL: Record<(typeof DAY_KEYS)[number], string> = {
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัส',
  fri: 'ศุกร์',
  sat: 'เสาร์',
  sun: 'อาทิตย์',
};

interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

function defaultHours(): Record<(typeof DAY_KEYS)[number], DayHours> {
  return Object.fromEntries(
    DAY_KEYS.map((d) => [d, { open: '08:00', close: '21:00', closed: false }]),
  ) as Record<(typeof DAY_KEYS)[number], DayHours>;
}

export default function MerchantLocalEditPage(): JSX.Element {
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const { data: store, isLoading } = useQuery({
    queryKey: ['local', 'store', shopId],
    queryFn: () => api.local.getStore(shopId),
  });

  const [kind, setKind] = useState<Kind>('LOCAL_GOODS');
  const [addressText, setAddressText] = useState('');
  const [lat, setLat] = useState<string>('13.7563');
  const [lng, setLng] = useState<string>('100.5018');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState<number>(5);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<number>(20);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [baseDeliveryCents, setBaseDeliveryCents] = useState<number>(3500);
  const [perKmCents, setPerKmCents] = useState<number>(800);
  const [active, setActive] = useState(true);
  const [hours, setHours] = useState(defaultHours);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    setKind(store.kind as Kind);
    setAddressText(store.addressText);
    setLat(String(store.lat));
    setLng(String(store.lng));
    setDeliveryRadiusKm(store.deliveryRadiusKm);
    setPrepTimeMinutes(store.prepTimeMinutes);
    setPickupEnabled(store.pickupEnabled);
    setDeliveryEnabled(store.deliveryEnabled);
    setBaseDeliveryCents(store.baseDeliveryCents);
    setPerKmCents(store.perKmCents);
    setActive(store.active);
    const h = defaultHours();
    for (const day of DAY_KEYS) {
      const ranges = store.openHours?.[day];
      if (ranges && ranges.length > 0) {
        h[day] = { open: ranges[0]!.open, close: ranges[0]!.close, closed: false };
      } else {
        h[day] = { open: '08:00', close: '21:00', closed: true };
      }
    }
    setHours(h);
  }, [store]);

  const save = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      const openHours = Object.fromEntries(
        DAY_KEYS.map((d) => [
          d,
          hours[d].closed ? [] : [{ open: hours[d].open, close: hours[d].close }],
        ]),
      );
      return api.local.upsert(token, shopId, {
        kind,
        lat: Number(lat),
        lng: Number(lng),
        addressText,
        deliveryRadiusKm: Number(deliveryRadiusKm),
        pickupEnabled,
        deliveryEnabled,
        prepTimeMinutes: Number(prepTimeMinutes),
        baseDeliveryCents: Number(baseDeliveryCents),
        perKmCents: Number(perKmCents),
        active,
        openHours,
      });
    },
    onSuccess: () => {
      setError(null);
      setOkMsg('บันทึกสำเร็จ');
      qc.invalidateQueries({ queryKey: ['local', 'store', shopId] });
      setTimeout(() => setOkMsg(null), 2500);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    },
  });

  async function fillMyLocation(): Promise<void> {
    const pos = await getCurrentPosition({ timeoutMs: 6000, highAccuracy: true });
    if (!pos) {
      setError('ไม่สามารถอ่านตำแหน่งได้');
      return;
    }
    setLat(String(pos.latitude));
    setLng(String(pos.longitude));
  }

  function submit(e: FormEvent): void {
    e.preventDefault();
    save.mutate();
  }

  if (isLoading) {
    return (
      <main className="container-mobile py-6">
        <Skeleton className="h-44 w-full rounded-3xl" />
      </main>
    );
  }

  return (
    <main className="container-mobile space-y-4 pb-32 pt-2">
      <Link
        href="/merchant/local"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-600"
      >
        <ChevronLeftIcon className="h-3 w-3" />
        กลับ
      </Link>

      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
          ตั้งค่าหน้าร้านท้องถิ่น
        </h1>
        <p className="text-[12px] text-ink-600">
          ข้อมูลนี้จะแสดงในหน้า "ใกล้ฉัน" ของลูกค้า
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        {/* Kind */}
        <div className="rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            ประเภทร้าน
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                  kind === k.id
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'bg-ink-50 text-ink-700 ring-1 ring-ink-100'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {/* Address + map */}
        <div className="rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            ที่ตั้งร้าน
          </label>
          <Input
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            placeholder="เลขที่ ถนน แขวง เขต จังหวัด"
            className="mt-2"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="ละติจูด"
              inputMode="decimal"
            />
            <Input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="ลองจิจูด"
              inputMode="decimal"
            />
          </div>
          <button
            type="button"
            onClick={() => void fillMyLocation()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 text-[12px] font-semibold text-ink-700 ring-1 ring-ink-100"
          >
            <NavigationIcon className="h-3 w-3" />
            ใช้ตำแหน่งปัจจุบัน
          </button>
        </div>

        {/* Delivery */}
        <div className="rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            ตัวเลือกการรับ
          </p>
          <div className="mt-2 space-y-2">
            <label className="flex items-center justify-between rounded-2xl bg-ink-50 px-3 py-2 ring-1 ring-ink-100">
              <span className="text-[13px] font-semibold text-ink-800">เปิดให้รับเอง</span>
              <input
                type="checkbox"
                checked={pickupEnabled}
                onChange={(e) => setPickupEnabled(e.target.checked)}
                className="h-5 w-5 accent-brand"
              />
            </label>
            <label className="flex items-center justify-between rounded-2xl bg-ink-50 px-3 py-2 ring-1 ring-ink-100">
              <span className="text-[13px] font-semibold text-ink-800">เปิดให้ส่งด่วน</span>
              <input
                type="checkbox"
                checked={deliveryEnabled}
                onChange={(e) => setDeliveryEnabled(e.target.checked)}
                className="h-5 w-5 accent-brand"
              />
            </label>
          </div>

          {deliveryEnabled ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  รัศมีส่ง (กม.)
                </label>
                <Input
                  type="number"
                  value={deliveryRadiusKm}
                  onChange={(e) => setDeliveryRadiusKm(Number(e.target.value))}
                  className="mt-1"
                  min={0}
                  max={50}
                  step={0.5}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  เวลาเตรียม (นาที)
                </label>
                <Input
                  type="number"
                  value={prepTimeMinutes}
                  onChange={(e) => setPrepTimeMinutes(Number(e.target.value))}
                  className="mt-1"
                  min={0}
                  max={180}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  ค่าส่งเริ่มต้น (บาท)
                </label>
                <Input
                  type="number"
                  value={baseDeliveryCents / 100}
                  onChange={(e) =>
                    setBaseDeliveryCents(Math.round(Number(e.target.value) * 100))
                  }
                  className="mt-1"
                  min={0}
                  step={5}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  เพิ่มต่อ กม. (บาท)
                </label>
                <Input
                  type="number"
                  value={perKmCents / 100}
                  onChange={(e) =>
                    setPerKmCents(Math.round(Number(e.target.value) * 100))
                  }
                  className="mt-1"
                  min={0}
                  step={1}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Hours */}
        <div className="rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            เวลาทำการ
          </p>
          <div className="mt-2 space-y-2">
            {DAY_KEYS.map((d) => (
              <div
                key={d}
                className="flex items-center gap-2 rounded-2xl bg-ink-50 px-3 py-2 ring-1 ring-ink-100"
              >
                <span className="w-14 text-[12px] font-semibold text-ink-800">
                  {DAY_LABEL[d]}
                </span>
                {hours[d].closed ? (
                  <span className="flex-1 text-[12px] text-ink-500">ปิด</span>
                ) : (
                  <>
                    <input
                      type="time"
                      value={hours[d].open}
                      onChange={(e) =>
                        setHours((h) => ({
                          ...h,
                          [d]: { ...h[d], open: e.target.value },
                        }))
                      }
                      className="flex-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12px]"
                    />
                    <span className="text-[12px] text-ink-500">–</span>
                    <input
                      type="time"
                      value={hours[d].close}
                      onChange={(e) =>
                        setHours((h) => ({
                          ...h,
                          [d]: { ...h[d], close: e.target.value },
                        }))
                      }
                      className="flex-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12px]"
                    />
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setHours((h) => ({
                      ...h,
                      [d]: { ...h[d], closed: !h[d].closed },
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    hours[d].closed
                      ? 'bg-ink-200 text-ink-700'
                      : 'bg-brand text-white'
                  }`}
                >
                  {hours[d].closed ? 'ปิด' : 'เปิด'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Active toggle */}
        <label className="flex items-center justify-between rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              สถานะ
            </p>
            <p className="font-display text-base font-bold tracking-tight text-ink-900">
              {active ? 'เปิดให้บริการ' : 'ปิดชั่วคราว'}
            </p>
          </div>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-6 w-6 accent-brand"
          />
        </label>

        {error ? (
          <div className="rounded-2xl bg-rose-50 p-3 text-[12px] text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        ) : null}
        {okMsg ? (
          <div className="rounded-2xl bg-emerald-50 p-3 text-[12px] text-emerald-700 ring-1 ring-emerald-200">
            {okMsg}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </form>

      {store ? (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/merchant/local/${shopId}/menu`}
            className="flex items-center justify-between rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur"
          >
            <div>
              <ListIcon className="mb-1 h-5 w-5 text-brand" />
              <p className="font-display text-sm font-bold tracking-tight text-ink-900">
                หมวดเมนู
              </p>
              <p className="text-[10px] text-ink-500">จัดกลุ่มสินค้า</p>
            </div>
          </Link>
          <Link
            href={`/merchant/local/${shopId}/slots`}
            className="flex items-center justify-between rounded-3xl bg-white/95 p-4 ring-1 ring-ink-100 shadow-card backdrop-blur"
          >
            <div>
              <CalendarIcon className="mb-1 h-5 w-5 text-brand" />
              <p className="font-display text-sm font-bold tracking-tight text-ink-900">
                ช่วงเวลา
              </p>
              <p className="text-[10px] text-ink-500">นัดรับ / นัดส่ง</p>
            </div>
          </Link>
        </div>
      ) : null}
    </main>
  );
}
