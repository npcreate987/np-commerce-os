'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import {
  ChevronLeftIcon,
  CheckIcon,
  MessageIcon,
  SendIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';

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

export default function DisputeDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dispute', params.id],
    queryFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.disputes.getOne(token, params.id);
    },
    enabled: Boolean(token),
    retry: false,
  });

  const sendReply = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.disputes.reply(token, params.id, { body: reply });
    },
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['dispute', params.id] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'ส่งข้อความไม่สำเร็จ'),
  });

  const resolve = useMutation({
    mutationFn: (resolution: 'REFUND' | 'RELEASE') => {
      if (!token) throw new Error('LOGIN_REQUIRED');
      return api.disputes.resolve(token, params.id, { resolution });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispute', params.id] }),
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'ปิดเคสไม่สำเร็จ'),
  });

  if (isLoading || !data) {
    return (
      <main className="container-mobile py-6 pb-28 space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
      </main>
    );
  }

  const status = STATUS[data.status] ?? { label: data.status, tone: 'neutral' as const };
  const isResolved = data.status.startsWith('RESOLVED') || data.status === 'CLOSED';
  const isMerchant = me?.role === 'MERCHANT';

  return (
    <main className="pb-28">
      <header
        className="glass sticky top-0 z-20 border-b border-white/40"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="container-mobile flex h-14 items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-ink-700 ring-1 ring-ink-100 active:scale-95"
            aria-label="ย้อนกลับ"
          >
            <ChevronLeftIcon />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-base font-bold tracking-tight text-ink-900">
              ข้อพิพาท
            </h1>
            <p className="text-[11px] text-ink-500">#{data.id.slice(0, 8)}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </header>

      <div className="container-mobile space-y-4 pt-4">
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-bold text-emerald-900">NP Protect</p>
          </div>
          <p className="text-xs text-emerald-900/80">
            {isResolved
              ? 'เคสนี้ปิดแล้ว'
              : 'ติดต่อร้านเพื่อหาทางออก ถ้าไม่สามารถตกลงกันได้ ทีมงาน NP จะเข้ามาช่วยตัดสิน'}
          </p>
          <Link
            href={`/orders/${data.orderId}`}
            className="mt-2 inline-block text-xs font-medium text-emerald-700 underline"
          >
            ดูออเดอร์ที่เกี่ยวข้อง →
          </Link>
        </section>

        <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <p className="text-[11px] uppercase tracking-wider text-ink-400">เหตุผล</p>
          <p className="text-sm font-semibold text-ink-900">
            {REASON[data.reason] ?? data.reason}
          </p>
          <p className="mt-2 text-sm text-ink-700">{data.description}</p>
        </section>

        {/* Message thread */}
        <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <MessageIcon className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-ink-900">การสนทนา</h2>
          </div>
          <ul className="space-y-2">
            {data.messages.map((m) => {
              const mine = m.authorId === me?.id;
              const isSystem = m.authorRole === 'ADMIN';
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex',
                    isSystem ? 'justify-center' : mine ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                      isSystem
                        ? 'bg-amber-50 text-amber-900 text-xs'
                        : mine
                          ? 'bg-brand text-white'
                          : 'bg-ink-100 text-ink-900',
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        isSystem ? 'text-amber-700' : mine ? 'text-white/70' : 'text-ink-500',
                      )}
                    >
                      {formatDate(m.createdAt)} · {m.authorRole === 'CUSTOMER' ? 'ลูกค้า' : m.authorRole === 'MERCHANT' ? 'ร้าน' : 'แอดมิน'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {!isResolved ? (
            <div className="mt-3 flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="พิมพ์ข้อความ..."
                className="flex-1 rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none"
              />
              <Button
                size="md"
                onClick={() => sendReply.mutate()}
                disabled={reply.trim().length === 0}
                loading={sendReply.isPending}
              >
                <SendIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
        </section>

        {/* Resolution actions */}
        {!isResolved ? (
          <section className="rounded-3xl border border-ink-100 bg-white p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">ปิดเคส</h2>
            {isMerchant ? (
              <div className="space-y-2">
                <p className="text-xs text-ink-500">
                  ในฐานะร้านค้า คุณสามารถยอมรับคืนเงินให้ลูกค้าได้
                </p>
                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => resolve.mutate('REFUND')}
                  loading={resolve.isPending}
                >
                  ยอมรับและคืนเงินให้ลูกค้า
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-ink-500">
                  ถ้าได้รับสินค้าและพอใจแล้ว สามารถปิดเคสและปล่อยเงินให้ร้าน
                </p>
                <Button
                  fullWidth
                  variant="primary"
                  onClick={() => resolve.mutate('RELEASE')}
                  loading={resolve.isPending}
                  leftIcon={<CheckIcon className="h-4 w-4" />}
                >
                  ปิดเคส — ปล่อยเงินให้ร้าน
                </Button>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
