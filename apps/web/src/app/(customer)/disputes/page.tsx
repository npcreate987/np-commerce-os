'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import { ShieldCheckIcon, MessageIcon, ChevronRightIcon } from '@/components/icons';

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  OPEN: { label: 'รอร้านตอบ', tone: 'warning' },
  MERCHANT_REPLIED: { label: 'ร้านตอบแล้ว', tone: 'info' },
  ESCALATED: { label: 'รอแอดมิน', tone: 'warning' },
  RESOLVED_REFUND: { label: 'คืนเงินแล้ว', tone: 'success' },
  RESOLVED_RELEASE: { label: 'ปิดเคส', tone: 'neutral' },
  CLOSED: { label: 'ปิดแล้ว', tone: 'neutral' },
};

const REASON: Record<string, string> = {
  ITEM_NOT_RECEIVED: 'ไม่ได้รับสินค้า',
  NOT_AS_DESCRIBED: 'สินค้าไม่ตรงปก',
  DAMAGED: 'สินค้าเสียหาย',
  OTHER: 'อื่นๆ',
};

export default function MyDisputesPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const { data, isLoading } = useQuery({
    queryKey: ['disputes', 'mine'],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.disputes.mine(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">ข้อพิพาท</h1>
        <EmptyState
          icon={<ShieldCheckIcon />}
          title="กรุณาเข้าสู่ระบบ"
          description="เพื่อดูคำขอคุ้มครองและข้อพิพาทของคุณ"
          action={
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow active:scale-95"
            >
              เข้าสู่ระบบ
            </Link>
          }
        />
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">ข้อพิพาท</h1>
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </main>
    );
  }

  if (data.length === 0) {
    return (
      <main className="container-mobile py-6 pb-28">
        <h1 className="mb-4 text-2xl font-bold text-ink-900">ข้อพิพาท</h1>
        <EmptyState
          icon={<ShieldCheckIcon />}
          title="ไม่มีข้อพิพาท"
          description="ทุกออเดอร์ของคุณคุ้มครองโดย NP Protect — เปิดเคสได้จากหน้าออเดอร์"
        />
      </main>
    );
  }

  return (
    <main className="container-mobile py-6 pb-28">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">ข้อพิพาท</h1>
        <Badge tone="info">{data.length}</Badge>
      </div>
      <ul className="space-y-3">
        {data.map((d) => {
          const status = STATUS[d.status] ?? { label: d.status, tone: 'neutral' as const };
          return (
            <li key={d.id}>
              <Link
                href={`/disputes/${d.id}`}
                className="flex items-start gap-3 rounded-3xl border border-ink-100 bg-white p-4 shadow-card transition active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand">
                  <MessageIcon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-900">
                      {REASON[d.reason] ?? d.reason}
                    </p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{d.description}</p>
                  <p className="mt-1 text-[11px] text-ink-400">
                    เปิดเมื่อ {formatDate(d.createdAt)}
                  </p>
                </div>
                <ChevronRightIcon className="mt-2 h-4 w-4 shrink-0 text-ink-300" />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
