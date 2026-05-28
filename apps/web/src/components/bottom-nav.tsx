'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth-store';
import {
  CommentIcon,
  HomeIcon,
  MapPinIcon,
  PlusIcon,
  UserIcon,
} from '@/components/icons';
import type { ComponentType, SVGProps } from 'react';

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Active when the current pathname is one of these (exact or startsWith). */
  match?: (pathname: string) => boolean;
  /** When set, show a tiny red dot indicator on the icon. */
  showDot?: boolean;
  /** When >0, show a "99+" style numeric badge on the icon. */
  badgeCount?: number;
}

export type BottomNavVariant = 'default' | 'overlay';

interface Props {
  variant?: BottomNavVariant;
}

/**
 * Customer bottom navigation (mobile <lg) — TikTok-style flat bar.
 *
 * Layout
 * ------
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  🏠       📍      ┌──┐      💬⁹⁹⁺      👤                   │
 *   │ หน้าหลัก ใกล้ฉัน  │ + │  กล่องข้อความ  โปรไฟล์            │
 *   │                    └──┘                                     │
 *   └────────────────────────────────────────────────────────────┘
 *
 * - Five evenly distributed items; the centre "+" is the signature TikTok
 *   block (white rect with cyan + pink misregistration slabs) that links to
 *   the clip composer at `/feed/create`.
 * - `ใกล้ฉัน` deep-links to `/local` (Local Commerce shop directory).
 *   Phase 20.3 — replaced the older `ร้านค้า` shop tab here so the
 *   primary commerce surface reflects the geo-first product strategy
 *   (the shop catalog is still reachable from `/feed/shop`).
 * - `กล่องข้อความ` shows an unread count badge driven by the inbox query.
 *
 * Variants
 * --------
 * - `default` — solid light/dark surface with hairline top border. Used on
 *   standard customer pages (cart, profile, search, …).
 * - `overlay` — solid black bar matching the TikTok feed chrome. A thin
 *   gradient *above* the bar (separate element) keeps the video-to-chrome
 *   transition smooth without bleeding any transparency into the bar
 *   itself — labels stay legible at all times. Used on the immersive
 *   `/feed` reel.
 */
export function CustomerBottomNav({ variant = 'default' }: Props = {}): JSX.Element {
  const pathname = usePathname() ?? '';
  const overlay = variant === 'overlay';
  const token = useAuthStore((s) => s.token);

  // Inbox unread count → numeric badge on `กล่องข้อความ`.
  // We share the cache key with the inbox page so the badge updates instantly
  // when the user reads / clears messages.
  const inboxQ = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api.broadcasts.inbox(token!),
    enabled: !!token,
    staleTime: 30_000,
  });
  const unreadCount = inboxQ.data?.filter((m) => !m.read).length ?? 0;

  // Cart → tiny red dot on `ร้านค้า` when there's anything in the cart.
  // Kept best-effort; missing data simply hides the dot.
  const cartQ = useQuery({
    queryKey: ['cart'],
    queryFn: () => api.cart.get(token!),
    enabled: !!token,
    staleTime: 30_000,
  });
  const cartHasItems = (cartQ.data?.items?.length ?? 0) > 0;

  const createHref = token ? '/feed/create' : '/login?next=%2Ffeed%2Fcreate';

  const items: NavItem[] = [
    {
      href: '/feed',
      label: 'หน้าหลัก',
      Icon: HomeIcon,
      match: (p) => p === '/feed' || p === '/',
    },
    {
      // Phase 20.3 — promoted Local Commerce ("near me") into the
      // primary tab slot. The same dot indicator now fires when the
      // cart has items or when the shop tab would have signalled
      // unfinished business, so the affordance survives.
      href: '/local',
      label: 'ใกล้ฉัน',
      Icon: MapPinIcon,
      match: (p) =>
        p.startsWith('/local') ||
        p.startsWith('/feed/shop') ||
        p.startsWith('/product') ||
        p.startsWith('/cart'),
      showDot: cartHasItems,
    },
    {
      href: '/inbox',
      label: 'กล่องข้อความ',
      Icon: CommentIcon,
      match: (p) => p.startsWith('/inbox'),
      badgeCount: unreadCount,
    },
    {
      href: '/profile',
      label: 'โปรไฟล์',
      Icon: UserIcon,
      match: (p) => p.startsWith('/profile') || p.startsWith('/orders'),
    },
  ];

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-bottomnav lg:hidden',
        overlay
          ? // Solid black like TikTok's feed bar (the prior gradient
            // made the icons sit on a half-transparent strip which
            // washed out against light video frames). The 14-px
            // fade rendered just above the bar (below) keeps the
            // video-to-chrome boundary soft.
            'bg-black text-white'
          : 'border-t border-surface bg-surface/95 text-surface-strong backdrop-blur-xl',
      )}
      // Phase 20.4 — pull the icons flush with the bottom edge of the
      // visible viewport. On devices with the Android 3-button nav
      // (or any system gesture bar) `env(safe-area-inset-bottom)` is
      // 0 because the WebView is already inset above the OS bar, so
      // dropping the explicit `+6px` buffer is what closes the gap.
      // The inset value still kicks in on iPhones with a notch /
      // home-indicator so the labels never sit on top of the gesture
      // pill there.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Soft fade ABOVE the bar (overlay-only). Sits as a sibling so
          the bar itself stays fully opaque and labels never lose
          contrast. 14-px tall is enough to soften the video boundary
          on a bright frame without eating screen real-estate. */}
      {overlay ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-3.5 h-3.5 bg-gradient-to-t from-black to-transparent"
        />
      ) : null}
      <nav
        aria-label="แท็บหลัก"
        className="mx-auto grid h-bottomnav-m max-w-mobile grid-cols-5 items-stretch"
      >
        {items.slice(0, 2).map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} overlay={overlay} />
        ))}

        {/* Centre "+" — TikTok signature button */}
        <div className="flex items-center justify-center">
          <Link
            href={createHref}
            aria-label="สร้างคลิปใหม่"
            prefetch={false}
            className="relative inline-flex h-9 w-12 items-center justify-center active:scale-95"
          >
            <CreateButton />
          </Link>
        </div>

        {items.slice(2).map((item) => (
          <NavTab key={item.href} item={item} pathname={pathname} overlay={overlay} />
        ))}
      </nav>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function NavTab({
  item,
  pathname,
  overlay,
}: {
  item: NavItem;
  pathname: string;
  overlay: boolean;
}): JSX.Element {
  const { href, label, Icon, match, showDot, badgeCount = 0 } = item;
  const active = match ? match(pathname) : pathname === href;

  return (
    <Link
      href={href}
      aria-label={label}
      // `justify-end` plus a tiny `pb-1` parks the icon + label stack
      // at the bottom of the 72-px nav cell instead of centring it,
      // matching the TikTok reference where the labels almost touch
      // the bottom of the bar.
      className="group relative flex flex-col items-center justify-end gap-0.5 pb-1"
    >
      <span
        className={cn(
          'relative inline-flex h-6 w-6 items-center justify-center transition',
          active
            ? overlay
              ? 'text-white'
              : 'text-surface-strong'
            : overlay
            ? 'text-white/70'
            : 'text-surface-muted',
        )}
      >
        <Icon
          className={cn('h-6 w-6', active && 'drop-shadow')}
          // Bump stroke for active state to mimic a "filled" appearance.
          strokeWidth={active ? 2.6 : 2}
        />
        {/* Numeric badge (e.g. 99+) */}
        {badgeCount > 0 ? (
          <span
            className={cn(
              'absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-[10px] font-bold leading-[16px] text-white shadow-sm ring-2',
              overlay ? 'ring-black' : 'ring-surface',
            )}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        ) : showDot ? (
          /* Tiny red unread dot */
          <span
            className={cn(
              'absolute right-0 top-0 h-2 w-2 rounded-full bg-brand ring-2',
              overlay ? 'ring-black' : 'ring-surface',
            )}
          />
        ) : null}
      </span>
      <span
        className={cn(
          'text-[10px] font-medium leading-tight transition',
          active
            ? overlay
              ? 'text-white'
              : 'text-surface-strong'
            : overlay
            ? 'text-white/65'
            : 'text-surface-muted',
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/**
 * TikTok-signature create button: white rounded rectangle with a black "+"
 * inside, plus offset cyan (left/up) and pink (right/down) slabs that create
 * a CMY misregistration effect.
 */
function CreateButton(): JSX.Element {
  return (
    <span className="relative inline-flex h-8 w-12 items-center justify-center">
      {/* Cyan slab — shifted left/up */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-7 w-10 -translate-x-1 -translate-y-0.5 rounded-lg"
        style={{ backgroundColor: '#22D3EE' }}
      />
      {/* Pink slab — shifted right/down */}
      <span
        aria-hidden
        className="absolute bottom-0 right-0 h-7 w-10 translate-x-1 translate-y-0.5 rounded-lg"
        style={{ backgroundColor: '#FE2C55' }}
      />
      {/* White top with black plus */}
      <span className="relative grid h-7 w-11 place-items-center rounded-lg bg-white text-ink-900 shadow-sm">
        <PlusIcon className="h-5 w-5" strokeWidth={3} />
      </span>
    </span>
  );
}
