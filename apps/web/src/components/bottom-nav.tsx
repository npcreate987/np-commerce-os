'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import {
  BagIcon,
  HomeIcon,
  MapPinIcon,
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
}

const items: NavItem[] = [
  { href: '/feed', label: 'ฟีด', Icon: HomeIcon, match: (p) => p === '/feed' },
  {
    href: '/feed/shop',
    label: 'ช้อป',
    Icon: StoreIcon,
    match: (p) => p.startsWith('/feed/shop') || p.startsWith('/product'),
  },
  { href: '/cart', label: 'ตะกร้า', Icon: BagIcon, match: (p) => p.startsWith('/cart') },
  { href: '/local', label: 'ใกล้ฉัน', Icon: MapPinIcon, match: (p) => p.startsWith('/local') },
  {
    href: '/profile',
    label: 'ฉัน',
    Icon: UserIcon,
    match: (p) => p.startsWith('/profile') || p.startsWith('/orders'),
  },
];

export type BottomNavVariant = 'default' | 'overlay';

interface Props {
  variant?: BottomNavVariant;
}

/**
 * Customer bottom navigation (mobile <lg).
 *
 * Variants
 * --------
 * - `default` — light/dark glass pill, used on standard customer pages.
 * - `overlay` — translucent dark pill, used on immersive pages such as `/feed`
 *   (TikTok-style video reel) so it floats nicely over video content.
 */
export function CustomerBottomNav({ variant = 'default' }: Props = {}): JSX.Element {
  const pathname = usePathname() ?? '';
  const overlay = variant === 'overlay';
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-bottomnav px-3 pb-3 lg:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      <nav
        className={cn(
          'mx-auto flex h-16 max-w-mobile items-stretch justify-between rounded-full px-2',
          overlay
            ? 'border border-white/10 bg-black/55 shadow-glass-dark backdrop-blur-xl'
            : 'glass-strong shadow-pop',
        )}
      >
        {items.map(({ href, label, Icon, match }) => {
          const active = match ? match(pathname) : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="group relative flex flex-1 flex-col items-center justify-center gap-0.5"
            >
              <span
                className={cn(
                  'relative flex h-9 items-center justify-center rounded-full transition',
                  active
                    ? 'bg-brand-gradient px-4 text-white shadow-glow'
                    : cn('px-3', overlay ? 'text-white/80' : 'text-surface-muted'),
                )}
              >
                <Icon className="h-5 w-5" />
                {active ? (
                  <span
                    className="absolute inset-0 rounded-full bg-noise opacity-25 mix-blend-overlay"
                    aria-hidden
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  'text-[10px] font-semibold transition',
                  active
                    ? overlay
                      ? 'text-white'
                      : 'text-brand'
                    : overlay
                    ? 'text-white/65'
                    : 'text-surface-muted',
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
