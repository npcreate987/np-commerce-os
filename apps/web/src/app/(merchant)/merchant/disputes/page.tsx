'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageIcon,
  ShieldCheckIcon,
} from '@/components/icons';

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  OPEN: { label: 'รอตอบ', tone: 'danger' },
  MERCHANT_REPLIED: { label: 'รอลูกค้า', tone: 'info' },
  ESCALATED: { label: 'รอแอดมิน', tone: 'warning' },
  RESOLVED_REFUND: { label: 'คืนเงินแล้ว', tone: 'neutral' },
  RESOLVED_RELEASE: { label: 'ปิดเคส', tone: 'success' },
  CLOSED: { label: 'ปิดแล้ว', tone: 'neutral' },
};

const REASON: Record<string, string> = {
  ITEM_NOT_RECEIVED: 'ไม่ได้รับสินค้า',
  NOT_AS_DESCRIBED: 'สินค้าไม่ตรงปก',
  DAMAGED: 'สินค้าเสียหาย',
  OTHER: 'อื่นๆ',
};

export default function MerchantDisputesPage(): JSX.Element {
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

  const { data: disputes, isLoading } = useQuery({
    queryKey: ['disputes', 'shop', shop?.id],
    queryFn: () => {
      if (!token || !shop) throw new Error('NO_SHOP');
      return api.disputes.forShop(token, shop.id);
    },
    enabled: Boolean(token && shop),
  });

  return (
    <main className="pb-28">
      <header
        className="glass sticky top-0 z-20 border-b border-white/40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <Link
            href="/merchant/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 active:scale-95"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="font-display text-base font-bold tracking-tight text-ink-900">
            ข้อพิพาทของร้าน
          </h1>
        </div>
      </header>

      <div className="container-mobile space-y-3 pt-4">
        {!shop ? (
          <EmptyState
            icon={<ShieldCheckIcon />}
            title="ยังไม่มีร้าน"
            description="สร้างร้านก่อนเพื่อรับข้อพิพาทจากลูกค้า"
          />
        ) : isLoading || !disputes ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : disputes.length === 0 ? (
          <EmptyState
            icon={<ShieldCheckIcon />}
            title="ไม่มีข้อพิพาท"
            description="ทำดีต่อไปเรื่อยๆ! ถ้ามีปัญหา ลูกค้าจะแจ้งผ่านระบบ NP Protect"
          />
        ) : (
          <ul className="space-y-3">
            {disputes.map((d) => {
              const s = STATUS[d.status] ?? { label: d.status, tone: 'neutral' as const };
              return (
                <li key={d.id}>
                  <Link
                    href={`/disputes/${d.id}`}
                    className="flex items-start gap-3 rounded-3xl border border-ink-100 bg-white p-4 shadow-card transition active:scale-[0.99]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                      <MessageIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-900">
                          {REASON[d.reason] ?? d.reason}
                        </p>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{d.description}</p>
                      <p className="mt-1 text-[11px] text-ink-400">
                        ออเดอร์ #{d.orderId.slice(0, 8)} · {formatDate(d.createdAt)}
                      </p>
                    </div>
                    <ChevronRightIcon className="mt-2 h-4 w-4 shrink-0 text-ink-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
