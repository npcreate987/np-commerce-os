'use client';

import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { PlusIcon } from '@/components/icons';

/**
 * Phase 12.1 — Floating Action Button used on the immersive `/feed` reel.
 *
 * Position
 *   - **Mobile (<lg)** — fixed centred just above the translucent bottom-nav
 *     pill. Bottom nav is 64 px tall + 12 px padding + safe-area, so we lift
 *     the FAB by ~5 rem to sit above it.
 *   - **Desktop (≥lg)** — anchored to bottom-right inside the page padding so
 *     it doesn't fight the centred phone-frame reel.
 *
 * Behaviour
 *   - Always links to `/feed/create`. The composer page handles its own auth
 *     gate (`useEffect` redirect to `/login?next=…`).
 *   - When the user is logged out we set the link's `href` to login directly so
 *     the URL bar shows a sensible intent.
 */
export function CreateFAB(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const href = token ? '/feed/create' : '/login?next=%2Ffeed%2Fcreate';

  return (
    <>
      {/* Mobile: floating circle above bottom nav */}
      <Link
        href={href}
        aria-label="สร้างคลิปใหม่"
        prefetch={false}
        className="fixed left-1/2 z-bottomnav -translate-x-1/2 lg:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
      >
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow ring-4 ring-black/40 backdrop-blur transition active:scale-90">
          <span
            className="absolute inset-0 rounded-full bg-noise opacity-25 mix-blend-overlay"
            aria-hidden
          />
          <PlusIcon className="relative h-6 w-6" />
        </span>
      </Link>

      {/* Desktop: small pill bottom-right of the viewport (under topbar) */}
      <Link
        href={href}
        aria-label="สร้างคลิปใหม่"
        prefetch={false}
        className="fixed bottom-8 right-8 z-bottomnav hidden lg:inline-flex"
      >
        <span className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow ring-1 ring-white/20 transition hover:shadow-pop active:scale-95">
          <PlusIcon className="h-4 w-4" />
          สร้างคลิป
        </span>
      </Link>
    </>
  );
}
