'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  BagIcon,
  BellIcon,
  SearchIcon,
  SparklesIcon,
} from '@/components/icons';
import { ThemeToggle } from '@/components/shell/theme-toggle';

/**
 * Mobile-only (<lg) sticky header for customer routes.
 * - Logo + search bar + bell + theme toggle
 * - Uses glass + safe-area top padding
 */
export function CustomerMobileHeader(): JSX.Element {
  const router = useRouter();
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
    <header
      className="glass sticky top-0 z-topbar border-b border-surface backdrop-blur-xl lg:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="container-mobile flex h-topbar-m items-center gap-2">
        <Link href="/feed" aria-label="หน้าหลัก" className="shrink-0">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <span className="absolute inset-0 rounded-2xl bg-noise opacity-30 mix-blend-overlay" aria-hidden />
            <SparklesIcon className="relative h-4 w-4" />
          </div>
        </Link>

        <form onSubmit={onSubmitSearch} className="flex-1">
          <label className="relative flex h-10 items-center rounded-2xl border border-surface bg-surface-raised pl-3 pr-3 transition focus-within:border-brand">
            <SearchIcon className="mr-2 h-4 w-4 text-surface-faint" />
            <input
              type="search"
              placeholder="ค้นหาสินค้า…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-full flex-1 bg-transparent text-sm text-surface-strong placeholder:text-surface-faint focus:outline-none"
            />
          </label>
        </form>

        <ThemeToggle className="h-10 w-10" />

        {/* Cart — bottom nav no longer carries a dedicated cart tab on mobile
            (the TikTok-style 5-item layout reserves the slot for the
            create-clip button), so we surface it here instead. */}
        <Link
          href="/cart"
          aria-label="ตะกร้า"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-surface bg-surface-raised text-surface-strong active:scale-95"
        >
          <BagIcon className="h-4 w-4" />
        </Link>

        <Link
          href="/inbox"
          aria-label="การแจ้งเตือน"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-surface bg-surface-raised text-surface-strong active:scale-95"
        >
          <BellIcon className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
