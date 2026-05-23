'use client';

/**
 * Phase 14.2 — `/profile` router page.
 *
 * Auth gate + form-factor switch only. Heavy lifting (data fetch, layout,
 * tabs) lives in `_mobile.tsx` (TikTok-style) and `_desktop.tsx`
 * (sidebar + grid). Both consume the same React Query keys so swapping
 * variants doesn't re-fetch.
 *
 * Why so much logic stays in this file: the hydration / login bounce is
 * the same for both variants — putting it here keeps each variant
 * concerned solely with rendering.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useIsDesktop } from '@/lib/use-responsive';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowRightIcon, UserIcon } from '@/components/icons';
import { MobileProfile } from './_mobile';
import { DesktopProfile } from './_desktop';

export default function ProfileRoutePage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isDesktop = useIsDesktop();
  const router = useRouter();

  useEffect(() => {
    if (hasHydrated && token === null) {
      router.replace('/login?next=%2Fprofile');
    }
  }, [hasHydrated, token, router]);

  // ----- Hydration / auth fallback -----------------------------------------
  if (!hasHydrated) {
    return (
      <main className="container-mobile pb-28">
        <div className="flex flex-col items-center gap-2 py-10">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="mt-2 h-5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-16 rounded-2xl" />
      </main>
    );
  }

  if (token === null) {
    return (
      <main className="container-mobile py-16">
        <EmptyState
          icon={<UserIcon />}
          title="ต้องเข้าสู่ระบบ"
          description="ดูโปรไฟล์ของคุณได้เฉพาะหลังเข้าสู่ระบบเท่านั้น"
          action={
            <Link
              href="/login?next=%2Fprofile"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              เข้าสู่ระบบ <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  return isDesktop ? <DesktopProfile /> : <MobileProfile />;
}
