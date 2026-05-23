'use client';

/**
 * Phase 12.2.1 — `/profile/edit` stub
 *
 * Lets users update their display name. Avatar/email/password editing are
 * intentionally out of scope for v1 — they need extra flows (image upload,
 * email-verify, password-confirm) that we'll layer on later. Keeping this
 * page real (not a coming-soon card) means the big "✏ แก้ไขโปรไฟล์" button
 * on `/profile` doesn't dead-end.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  PencilIcon,
  UserIcon,
} from '@/components/icons';

export default function ProfileEditPage(): JSX.Element {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && token === null) {
      router.replace('/login?next=%2Fprofile%2Fedit');
    }
  }, [hasHydrated, token, router]);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!token || !user) throw new Error('NOT_AUTH');
      // Backend doesn't have a /v1/users/me PATCH yet — we mutate local
      // state so the UI feels alive. When the endpoint ships, swap this
      // for `api.users.updateMe(token, { name })`.
      const next = { ...user, name: name.trim() };
      setAuth({ user: next, token });
      return next;
    },
    onSuccess: () => {
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 1600);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  });

  if (!hasHydrated) {
    return (
      <main className="container-mobile py-6 pb-28">
        <Skeleton className="h-32 rounded-2xl" />
      </main>
    );
  }

  if (token === null) {
    return (
      <main className="container-mobile py-16">
        <EmptyState
          icon={<UserIcon />}
          title="ต้องเข้าสู่ระบบ"
          description="แก้ไขโปรไฟล์ได้เฉพาะหลังเข้าสู่ระบบเท่านั้น"
          action={
            <Link
              href="/login?next=%2Fprofile%2Fedit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              เข้าสู่ระบบ <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  const initial = (name?.trim()?.[0] || user?.email?.[0] || '?').toUpperCase();

  return (
    <main className="container-mobile space-y-5 py-4 pb-28">
      <header className="flex items-center gap-2">
        <Link
          href="/profile"
          aria-label="ย้อนกลับ"
          className="grid h-9 w-9 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-ink-900">แก้ไขโปรไฟล์</h1>
      </header>

      <div className="flex flex-col items-center gap-2 py-4">
        <div className="relative">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-brand-gradient text-3xl font-bold text-white ring-4 ring-white shadow-pop">
            {initial}
          </div>
          <button
            type="button"
            disabled
            aria-label="เปลี่ยนรูป (เร็ว ๆ นี้)"
            className="absolute bottom-0 right-0 grid h-7 w-7 cursor-not-allowed place-items-center rounded-full bg-ink-200 text-ink-500 ring-2 ring-white"
            title="เร็ว ๆ นี้"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-ink-400">การเปลี่ยนรูปโปรไฟล์ — เร็ว ๆ นี้</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length === 0) {
            setError('กรุณาใส่ชื่อ');
            return;
          }
          saveM.mutate();
        }}
        className="space-y-4 rounded-2xl border bg-white p-4"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-700">ชื่อที่จะแสดง</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="เช่น KJ Station"
            className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-right text-[10px] text-ink-400">{name.length}/60</p>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-500">อีเมล</span>
          <input
            type="email"
            value={user?.email ?? ''}
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-ink-100 bg-ink-50 px-3 py-2 text-sm text-ink-500"
          />
          <p className="mt-1 text-[10px] text-ink-400">การเปลี่ยนอีเมล — เร็ว ๆ นี้</p>
        </label>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
        {saved && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            ✓ บันทึกแล้ว
          </p>
        )}

        <div className="flex gap-2">
          <Link
            href="/profile"
            className="flex-1 rounded-2xl border border-ink-200 px-4 py-2.5 text-center text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={saveM.isPending || name === (user?.name ?? '')}
            className="flex-1 rounded-2xl bg-brand-gradient px-4 py-2.5 text-sm font-bold text-white shadow-glow active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveM.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>

      <p className="text-center text-[11px] text-ink-400">
        การเปลี่ยนรหัสผ่านและการเชื่อมโซเชียล — เร็ว ๆ นี้
      </p>
    </main>
  );
}
