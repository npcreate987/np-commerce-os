'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import {
  BagIcon,
  BellIcon,
  MapPinIcon,
  PackageIcon,
  SearchIcon,
  SparklesIcon,
  StoreIcon,
  UserIcon,
  VideoIcon,
} from '@/components/icons';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { cn } from '@/lib/cn';

const navItems = [
  { href: '/feed', label: 'ฟีด', Icon: VideoIcon },
  { href: '/feed/shop', label: 'ช้อป', Icon: StoreIcon },
  { href: '/local', label: 'ใกล้ฉัน', Icon: MapPinIcon },
  { href: '/orders', label: 'คำสั่งซื้อ', Icon: PackageIcon },
];

/**
 * Desktop-only (≥lg) top bar for customer routes.
 * - Logo + horizontal nav + search + bell + cart + profile + theme toggle
 * - Hidden on <lg viewports (mobile uses CustomerMobileHeader)
 */
export function CustomerTopBar(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');

  const onSubmitSearch = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      router.push('/search');
      return;
    }
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="sticky top-0 z-topbar hidden border-b border-surface bg-surface/80 backdrop-blur-xl lg:block">
      <div className="container-app flex h-topbar-d items-center gap-6">
        {/* Logo */}
        <Link href="/feed" className="flex items-center gap-2.5" aria-label="หน้าหลัก">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <span className="absolute inset-0 rounded-2xl bg-noise opacity-30 mix-blend-overlay" aria-hidden />
            <SparklesIcon className="relative h-4 w-4" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight text-surface-strong">
            TuKTuK
          </span>
        </Link>

        {/* Primary nav */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, Icon }) => {
            // `/feed` is the TikTok-style reel — match exact only so that
            // `/feed/shop` highlights the Shop tab instead.
            const active =
              href === '/feed'
                ? pathname === '/feed'
                : pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition',
                  active
                    ? 'bg-brand-gradient text-white shadow-glow'
                    : 'text-surface-strong/80 hover:bg-surface-raised hover:text-surface-strong',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Search bar (grows) */}
        <form onSubmit={onSubmitSearch} className="flex-1">
          <label className="relative flex h-10 items-center rounded-2xl border border-surface bg-surface-raised pl-3 pr-3 transition focus-within:border-brand focus-within:shadow-glow/30">
            <SearchIcon className="mr-2 h-4 w-4 text-surface-faint" />
            <input
              type="search"
              placeholder="ค้นหาสินค้า ร้านค้า แบรนด์…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-full flex-1 bg-transparent text-sm text-surface-strong placeholder:text-surface-faint focus:outline-none"
            />
            <kbd className="hidden rounded-md border border-surface bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-surface-muted xl:inline-block">
              /
            </kbd>
          </label>
        </form>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/inbox"
            aria-label="กล่องข้อความ"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-surface bg-surface-raised text-surface-strong transition hover:shadow-soft active:scale-95"
          >
            <BellIcon className="h-4 w-4" />
          </Link>
          <Link
            href="/cart"
            aria-label="ตะกร้า"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-surface bg-surface-raised text-surface-strong transition hover:shadow-soft active:scale-95"
          >
            <BagIcon className="h-4 w-4" />
          </Link>
          {token ? (
            <Link
              href="/profile/privacy"
              aria-label="โปรไฟล์"
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-ink-900 px-3 text-sm font-semibold text-white shadow-card transition hover:shadow-pop active:scale-95 dark:bg-white dark:text-ink-900"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">
                {(user?.name ?? user?.email ?? 'U').slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[100px] truncate">
                {user?.name ?? 'ฉัน'}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition hover:shadow-pop active:scale-95"
            >
              <UserIcon className="h-4 w-4" />
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
