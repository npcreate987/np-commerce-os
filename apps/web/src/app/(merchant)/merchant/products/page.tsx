'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatTHB } from '@/lib/format';
import {
  ArrowRightIcon,
  BagIcon,
  ChevronLeftIcon,
  PlusIcon,
} from '@/components/icons';

export default function MerchantProductsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);

  const { data: shops } = useQuery({
    queryKey: ['shops', 'mine'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.shops.mine(token);
    },
    enabled: Boolean(token),
  });
  const shop = shops?.[0];

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', 'shop', shop?.id],
    queryFn: () => {
      if (!token || !shop) throw new Error('NO_SHOP');
      return api.products.listByShop(token, shop.id);
    },
    enabled: Boolean(token && shop),
  });

  if (!shop) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">สินค้า</h1>
        <EmptyState
          icon={<BagIcon />}
          title="ยังไม่มีร้าน"
          description="สร้างร้านของคุณก่อนเพื่อเริ่มลงสินค้า"
          action={
            <Link
              href="/merchant/dashboard"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              ไปแดชบอร์ด
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="pb-28">
      <header
        className="sticky top-0 z-20 border-b border-ink-100 bg-white/95 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <Link
            href="/merchant/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-50 text-ink-700 active:scale-95"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="flex-1 text-base font-bold text-ink-900">สินค้า</h1>
          <Link href="/merchant/products/new">
            <Button size="sm" leftIcon={<PlusIcon className="h-4 w-4" />}>
              เพิ่ม
            </Button>
          </Link>
        </div>
      </header>

      <div className="container-mobile pt-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : products && products.length > 0 ? (
          <ul className="space-y-3">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex gap-3 rounded-3xl border border-ink-100 bg-white p-3 shadow-card"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-ink-100">
                  {p.media[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.media[0].url}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <p className="line-clamp-1 text-sm font-semibold text-ink-900">{p.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
                      <Badge tone={p.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {p.status}
                      </Badge>
                      <span>คงเหลือ {p.stock}</span>
                    </div>
                  </div>
                  <p className="text-[15px] font-bold tabular-nums text-brand">
                    {formatTHB(p.priceCents)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<BagIcon />}
            title="ยังไม่มีสินค้า"
            description="เริ่มลงสินค้าชิ้นแรกของคุณ"
            action={
              <Link
                href="/merchant/products/new"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
              >
                <PlusIcon className="h-4 w-4" />
                เพิ่มสินค้า
              </Link>
            }
          />
        )}
      </div>
    </main>
  );
}
