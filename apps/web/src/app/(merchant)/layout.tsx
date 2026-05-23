'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth-store';

const tabs = [
  { href: '/merchant/dashboard', label: 'แดชบอร์ด' },
  { href: '/merchant/products', label: 'สินค้า' },
  { href: '/merchant/orders', label: 'ออเดอร์' },
  { href: '/merchant/wallet', label: 'เงิน' },
  { href: '/merchant/local', label: 'หน้าร้าน' },
  { href: '/merchant/marketing', label: 'การตลาด' },
  { href: '/merchant/insights', label: 'AI Insights' },
];

export default function MerchantLayout({ children }: { children: ReactNode }): JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token === null) router.replace('/login');
  }, [token, router]);

  if (!token) return null;

  return (
    <div className="min-h-dvh bg-gray-50 pb-20">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white">
        <div className="container-mobile flex h-12 items-center justify-between">
          <span className="text-sm font-bold text-brand">NP Merchant</span>
          <Link href="/feed" className="text-xs text-gray-500">
            ดูเหมือนลูกค้า →
          </Link>
        </div>
        <nav className="container-mobile flex gap-2 pb-2">
          {tabs.map((t) => {
            const active = pathname === t.href || pathname?.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600',
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
