'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeftIcon,
  MegaphoneIcon,
  SparklesIcon,
  TrendingUpIcon,
  ChartIcon,
} from '@/components/icons';
import type { SocialAccount } from '@np/types';

const PLATFORMS: { value: SocialAccount['platform']; label: string }[] = [
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'X', label: 'X (Twitter)' },
  { value: 'LINE', label: 'LINE' },
  { value: 'OTHER', label: 'อื่นๆ' },
];

export default function ApplyCreatorPage(): JSX.Element {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [socials, setSocials] = useState<SocialAccount[]>([
    { platform: 'TIKTOK', url: '' },
  ]);
  const [err, setErr] = useState<string | null>(null);

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
    if (profileQuery.data) router.replace('/creator/dashboard');
  }, [profileQuery.data, router]);

  const mut = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      const cleanedSocials = socials.filter((s) => s.url.trim().length > 0);
      return api.creators.apply(token, {
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        social: cleanedSocials.length > 0 ? cleanedSocials : undefined,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['creator'] });
      router.push('/creator/dashboard');
    },
    onError: (e) => {
      setErr(e instanceof ApiError ? e.message : 'สมัครไม่สำเร็จ');
    },
  });

  if (!token) {
    return (
      <main className="container-mobile py-12">
        <p className="mb-6 text-center text-ink-600">กรุณาเข้าสู่ระบบก่อนสมัคร Creator</p>
        <Link
          href="/login"
          className="block rounded-2xl bg-brand-gradient py-3 text-center font-semibold text-white shadow-glow"
        >
          เข้าสู่ระบบ
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-gray-50 pb-20">
      {/* Hero */}
      <header
        className="relative overflow-hidden bg-mesh-2 px-4 pt-12 pb-10 text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 32px)' }}
      >
        <Link
          href="/feed"
          className="absolute left-4 top-12 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
          style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-16 -left-12 h-52 w-52 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="relative mx-auto max-w-mobile">
          <Badge tone="brand" className="bg-white/15 text-white">
            NP Creator
          </Badge>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight">
            สร้างรายได้ <br />
            ด้วยการรีวิว / แชร์ของที่ชอบ
          </h1>
          <p className="mt-2 max-w-sm text-sm text-white/80">
            สมัครฟรี — สร้างลิงก์โปรโมท ใส่ใน TikTok / IG / YouTube ของคุณ
            เมื่อมีคนซื้อผ่านลิงก์ คุณได้ค่าคอมจริงเข้ากระเป๋าทันที
          </p>
        </div>
      </header>

      <div className="container-mobile mt-6 space-y-6">
        {/* Benefits */}
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white p-3 text-center shadow-card">
            <SparklesIcon className="mx-auto h-5 w-5 text-brand" />
            <p className="mt-1 text-[11px] font-semibold text-ink-700">เริ่มต้นที่ 5%</p>
            <p className="text-[10px] text-ink-500">ค่าคอม</p>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-card">
            <TrendingUpIcon className="mx-auto h-5 w-5 text-emerald-600" />
            <p className="mt-1 text-[11px] font-semibold text-ink-700">ตามผลจริง</p>
            <p className="text-[10px] text-ink-500">ไม่มี cap</p>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-card">
            <ChartIcon className="mx-auto h-5 w-5 text-fuchsia-600" />
            <p className="mt-1 text-[11px] font-semibold text-ink-700">Tracking</p>
            <p className="text-[10px] text-ink-500">เรียลไทม์</p>
          </div>
        </section>

        {/* Form */}
        <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <MegaphoneIcon className="h-5 w-5 text-brand" />
            <h2 className="text-base font-bold text-ink-900">สมัครเป็น Creator</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-700">
                ชื่อที่จะแสดง <span className="text-red-500">*</span>
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="เช่น Noey Talks Gadgets"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink-700">แนะนำตัว (optional)</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="เล่าสั้นๆ ว่าคุณรีวิวสายไหน / ทำคอนเทนต์แบบไหน"
                className="mt-1 w-full rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink-700">ช่องทาง Social (optional)</label>
              <div className="mt-1 space-y-2">
                {socials.map((s, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select
                      value={s.platform}
                      onChange={(e) => {
                        const next = [...socials];
                        next[idx] = { ...s, platform: e.target.value as SocialAccount['platform'] };
                        setSocials(next);
                      }}
                      className="h-11 rounded-2xl border border-ink-200 bg-white px-3 text-sm"
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={s.url}
                      onChange={(e) => {
                        const next = [...socials];
                        next[idx] = { ...s, url: e.target.value };
                        setSocials(next);
                      }}
                      placeholder="https://"
                      className="flex-1"
                    />
                  </div>
                ))}
                {socials.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setSocials([...socials, { platform: 'INSTAGRAM', url: '' }])}
                    className="text-xs font-semibold text-brand"
                  >
                    + เพิ่มช่องทาง
                  </button>
                )}
              </div>
            </div>

            {err && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {err}
              </div>
            )}

            <Button
              onClick={() => {
                setErr(null);
                mut.mutate();
              }}
              loading={mut.isPending}
              disabled={displayName.trim().length < 2}
              fullWidth
              size="lg"
            >
              สมัครเลย — ฟรี
            </Button>
            <p className="text-center text-[11px] text-ink-500">
              เมื่อสมัคร = ยอมรับเงื่อนไข Creator ของ NP Commerce OS
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
