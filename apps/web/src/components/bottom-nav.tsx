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
  PlusIcon,
  StoreIcon,
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
 *   │  🏠       🛒•      ┌──┐      💬⁹⁹⁺      👤                  │
 *   │ หน้าหลัก  ร้านค้า  │ + │  กล่องข้อความ  โปรไฟล์            │
 *   │                    └──┘                                     │
 *   └────────────────────────────────────────────────────────────┘
 *
 * - Five evenly distributed items; the centre "+" is the signature TikTok
 *   block (white rect with cyan + pink misregistration slabs) that links to
 *   the clip composer at `/feed/create`.
 * - `ร้านค้า` shows a small red dot when there are unsent cart items.
 * - `กล่องข้อความ` shows an unread count badge driven by the inbox query.
 *
 * Variants
 * --------
 * - `default` — solid light/dark surface with hairline top border. Used on
 *   standard customer pages (cart, profile, search, …).
 * - `overlay` — flat dark with a soft top gradient for legibility. Used on
 *   the immersive `/feed` reel so the bar reads as part of the player UI.
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
      href: '/feed/shop',
      label: 'ร้านค้า',
      Icon: StoreIcon,
      match: (p) =>
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
          ? // The reel paints its own background, so we only add a soft top
            // gradient for legibility against light video frames.
            'bg-gradient-to-t from-black via-black/85 to-transparent pt-3 text-white'
          : 'border-t border-surface bg-surface/95 text-surface-strong backdrop-blur-xl',
      )}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}
    >
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
      className="group relative flex flex-col items-center justify-center gap-0.5 pt-0.5"
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
