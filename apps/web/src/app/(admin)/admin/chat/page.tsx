'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';
import type { ChatConversation, ChatMessage, HandoffStatus } from '@np/types';

const FILTERS: Array<{
  id: 'REQUESTED' | 'HUMAN' | 'ALL';
  label: string;
}> = [
  { id: 'REQUESTED', label: 'รอเจ้าหน้าที่' },
  { id: 'HUMAN', label: 'กำลังคุย' },
  { id: 'ALL', label: 'ทั้งหมด' },
];

export default function AdminChatPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const [filter, setFilter] = useState<'REQUESTED' | 'HUMAN' | 'ALL'>('REQUESTED');
  const [activeId, setActiveId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['admin', 'chat', 'list', filter],
    queryFn: () => api.chat.admin.list(token!, { handoff: filter, limit: 100 }),
    enabled: !!token,
    refetchInterval: 15_000,
  });

  const list = listQ.data ?? [];

  useEffect(() => {
    if (!activeId && list[0]) {
      setActiveId(list[0].id);
    }
  }, [activeId, list]);

  return (
    <main className="container-mobile space-y-4 pb-20 pt-4">
      <header>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-brand">
          <span className="text-base leading-none">💬</span>
          Customer Support
        </p>
        <h1 className="text-xl font-bold text-ink-900">แชทลูกค้า</h1>
        <p className="text-xs text-ink-500">
          ดู conversation ที่บอทส่งต่อ · ตอบเองโดยตรง · ปิดเคสเมื่อจบ
        </p>
      </header>

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              filter === f.id
                ? 'bg-brand-gradient text-white shadow-glow'
                : 'bg-white text-ink-700 ring-1 ring-ink-200',
            )}
          >
            {f.label}
            {filter === f.id ? ` (${list.length})` : null}
          </button>
        ))}
      </div>

      {listQ.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState
          title="ยังไม่มี conversation ที่ตรง filter"
          description="ลองสลับ filter ด้านบน — หรือรอให้ลูกค้าส่งคำขอ"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-[280px_1fr]">
          <ul className="space-y-1.5">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'w-full rounded-2xl border bg-white p-3 text-left transition',
                    activeId === c.id
                      ? 'border-brand-400 ring-2 ring-brand-100'
                      : 'border-ink-100 hover:border-ink-200',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-semibold text-ink-900">
                      {c.title || c.id}
                    </p>
                    <HandoffBadge status={c.handoffStatus} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-ink-500">
                    {c.userId}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-400">
                    {new Date(c.lastMessageAt).toLocaleString('th-TH')}
                    {c.unreadByAdmin > 0 ? (
                      <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {c.unreadByAdmin} ใหม่
                      </span>
                    ) : null}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {activeId ? (
            <ConversationPane
              conversation={list.find((c) => c.id === activeId) ?? null}
              conversationId={activeId}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}

function HandoffBadge({ status }: { status: HandoffStatus }): JSX.Element {
  const map: Record<HandoffStatus, { label: string; cls: string }> = {
    BOT: { label: 'BOT', cls: 'bg-ink-100 text-ink-700' },
    REQUESTED: { label: 'รอ', cls: 'bg-rose-100 text-rose-700' },
    HUMAN: { label: 'คุย', cls: 'bg-emerald-100 text-emerald-700' },
    RESOLVED: { label: 'ปิด', cls: 'bg-ink-100 text-ink-500' },
  };
  const m = map[status];
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-bold',
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

function ConversationPane({
  conversation,
  conversationId,
}: {
  conversation: ChatConversation | null;
  conversationId: string;
}): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const [closeAfter, setCloseAfter] = useState(false);

  const messagesQ = useQuery({
    queryKey: ['admin', 'chat', 'messages', conversationId],
    queryFn: () => api.chat.admin.messages(token!, conversationId),
    enabled: !!token,
    refetchInterval: 8000,
  });

  const replyM = useMutation({
    mutationFn: () =>
      api.chat.admin.reply(token!, {
        conversationId,
        text: draft.trim(),
        closeAfter,
      }),
    onSuccess: () => {
      setDraft('');
      setCloseAfter(false);
      void qc.invalidateQueries({
        queryKey: ['admin', 'chat', 'messages', conversationId],
      });
      void qc.invalidateQueries({ queryKey: ['admin', 'chat', 'list'] });
    },
  });

  const takeM = useMutation({
    mutationFn: () => api.chat.admin.takeOver(token!, conversationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'chat', 'list'] });
    },
  });

  const messages = messagesQ.data ?? [];

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const groups = useMemo(() => groupByDay(messages), [messages]);

  return (
    <section className="overflow-hidden rounded-3xl bg-white ring-1 ring-ink-100">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {conversation?.title || conversationId}
          </p>
          <p className="text-[11px] text-ink-500">
            ลูกค้า: {conversation?.userId ?? '—'} ·{' '}
            <HandoffBadge status={conversation?.handoffStatus ?? 'BOT'} />
          </p>
        </div>
        {conversation?.handoffStatus !== 'HUMAN' ? (
          <button
            type="button"
            onClick={() => takeM.mutate()}
            disabled={takeM.isPending}
            className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
          >
            รับเรื่อง
          </button>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        className="max-h-[60vh] min-h-[300px] space-y-3 overflow-y-auto bg-ink-50/40 px-3 py-4"
      >
        {groups.map((g) => (
          <div key={g.day} className="space-y-2">
            <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-ink-400">
              {g.day}
            </p>
            {g.items.map((m) => (
              <AdminMessageBubble key={m.id} message={m} />
            ))}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) replyM.mutate();
        }}
        className="space-y-2 border-t border-ink-100 bg-white p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="พิมพ์ตอบกลับลูกค้า…"
          className="w-full resize-none rounded-2xl border border-ink-100 bg-ink-50/40 px-3 py-2 text-sm outline-none focus:border-brand-300"
          disabled={replyM.isPending}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-600">
            <input
              type="checkbox"
              checked={closeAfter}
              onChange={(e) => setCloseAfter(e.target.checked)}
            />
            ปิดเคสหลังตอบ
          </label>
          <button
            type="submit"
            disabled={!draft.trim() || replyM.isPending}
            className="rounded-full bg-brand-gradient px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-brand-500/30 disabled:opacity-50"
          >
            {replyM.isPending ? 'กำลังส่ง…' : 'ส่ง'}
          </button>
        </div>
      </form>
    </section>
  );
}

function AdminMessageBubble({ message }: { message: ChatMessage }): JSX.Element {
  const isUser = message.role === 'USER';
  const isAdmin =
    message.role === 'ASSISTANT' && message.toolName === 'admin_reply';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm',
          isUser
            ? 'bg-white text-ink-900 ring-1 ring-ink-100'
            : isAdmin
              ? 'bg-emerald-500 text-white'
              : 'bg-accent-violet/10 text-ink-900 ring-1 ring-accent-violet/30',
        )}
      >
        {!isUser ? (
          <p
            className={cn(
              'mb-1 text-[9px] font-bold uppercase tracking-wider',
              isAdmin ? 'text-white/80' : 'text-accent-violet',
            )}
          >
            {isAdmin ? 'เจ้าหน้าที่' : 'บอท'}
            {message.toolName && !isAdmin ? ` · ${message.toolName}` : ''}
          </p>
        ) : null}
        <p>{message.content}</p>
        <p
          className={cn(
            'mt-1 text-[9px]',
            isUser ? 'text-ink-400' : 'text-white/70 text-end',
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}

interface DayGroup {
  day: string;
  items: ChatMessage[];
}

function groupByDay(messages: ChatMessage[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const m of messages) {
    const day = new Date(m.createdAt).toLocaleDateString('th-TH');
    const last = out[out.length - 1];
    if (last && last.day === day) {
      last.items.push(m);
    } else {
      out.push({ day, items: [m] });
    }
  }
  return out;
}
