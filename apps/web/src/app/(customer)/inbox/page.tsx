'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { BellIcon, MegaphoneIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

export default function InboxPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const inboxQ = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api.broadcasts.inbox(token!),
    enabled: !!token,
  });

  const readM = useMutation({
    mutationFn: (id: string) => api.broadcasts.markRead(token!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
  const readAllM = useMutation({
    mutationFn: () => api.broadcasts.markAllRead(token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });

  if (!token) {
    return (
      <div className="container-app py-10">
        <EmptyState
          title="ล็อกอินก่อน"
          description="เข้าระบบเพื่อรับข้อความและโปรโมชั่นจากเรา"
          action={
            <Link
              href="/login"
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow"
            >
              เข้าสู่ระบบ
            </Link>
          }
        />
      </div>
    );
  }

  const unread = inboxQ.data?.filter((m) => !m.read).length ?? 0;

  return (
    <div className="container-app space-y-4 pb-24 pt-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Inbox</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">กล่องข้อความ</h1>
          {unread > 0 ? (
            <p className="mt-0.5 text-[11px] text-ink-500">{unread} ข้อความใหม่</p>
          ) : null}
        </div>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => readAllM.mutate()}
            className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-brand ring-1 ring-brand-100"
          >
            อ่านทั้งหมด
          </button>
        ) : null}
      </header>

      {inboxQ.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !inboxQ.data || inboxQ.data.length === 0 ? (
        <EmptyState
          title="ยังไม่มีข้อความ"
          description="ติดตามอัปเดตและคูปองพิเศษได้ที่นี่"
          icon={<BellIcon className="h-8 w-8 text-ink-300" />}
        />
      ) : (
        <div className="space-y-2">
          {inboxQ.data.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => {
                if (!m.read) readM.mutate(m.id);
              }}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl p-3 text-left shadow-sm ring-1 transition',
                m.read
                  ? 'bg-white ring-ink-100'
                  : 'bg-brand-50/50 ring-brand-100 hover:bg-brand-50',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                  m.read ? 'bg-ink-100 text-ink-400' : 'bg-brand-gradient text-white shadow-glow',
                )}
              >
                <MegaphoneIcon className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-900">{m.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-600">{m.body}</p>
                <p className="mt-1 text-[10px] text-ink-400">
                  {new Date(m.createdAt).toLocaleString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              {!m.read ? (
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
