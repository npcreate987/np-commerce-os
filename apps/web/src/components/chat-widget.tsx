'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/cn';
import type { ChatAction, ChatMessage, HandoffStatus } from '@np/types';

/** Extract a productId from the current pathname so the chatbot knows what
 *  the user is looking at. Pure / no side effects. */
function inferProductContext(pathname: string | null): {
  productId?: string;
  surface?: string;
} | undefined {
  if (!pathname) return undefined;
  const productMatch = pathname.match(/^\/product\/([^/?#]+)/);
  if (productMatch?.[1]) {
    return { productId: productMatch[1], surface: 'pdp' };
  }
  if (pathname.startsWith('/cart')) return { surface: 'cart' };
  if (pathname.startsWith('/checkout')) return { surface: 'checkout' };
  if (pathname.startsWith('/search')) return { surface: 'search' };
  return undefined;
}

/**
 * Phase 9.3 — CS Chatbot floating widget.
 *
 * Rendered globally inside the customer layout. Polls active conversation
 * every 8s while open so admin replies appear without a manual refresh.
 *
 * Design notes:
 *   - We optimistically append the user message before the server confirms.
 *   - Bot replies arrive as the response payload (no streaming yet — keeps
 *     deps tiny). Could swap to SSE later without touching this component.
 *   - When the conversation handoff state is HUMAN/REQUESTED the input still
 *     works but the "typing…" hint reads "ทีมงานจะติดต่อกลับ".
 */
export function ChatWidget(): JSX.Element | null {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  // Phase 10.3 — derive chat context from URL so the bot can pivot to
  // product-aware help (e.g. on PDP). Re-computed on each render but cheap.
  const chatContext = useMemo(
    () => inferProductContext(pathname),
    [pathname],
  );

  const configQ = useQuery({
    queryKey: ['chat', 'config'],
    queryFn: () => api.chat.config(),
    staleTime: 5 * 60_000,
  });

  const activeQ = useQuery({
    queryKey: ['chat', 'active'],
    queryFn: () => api.chat.active(token ?? ''),
    enabled: Boolean(token) && open,
  });

  const conversationId = activeQ.data?.id;
  const handoff: HandoffStatus = activeQ.data?.handoffStatus ?? 'BOT';

  const messagesQ = useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: () => api.chat.messages(token ?? '', conversationId ?? ''),
    enabled: Boolean(token) && Boolean(conversationId),
    refetchInterval: open ? 8000 : false,
  });

  const sendM = useMutation({
    mutationFn: (text: string) =>
      api.chat.send(token ?? '', {
        text,
        conversationId,
        context: chatContext,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chat', 'active'] });
      void qc.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] });
    },
  });

  const enabled = configQ.data?.enabled !== false;
  const config = configQ.data;

  useEffect(() => {
    if (!open) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messagesQ.data, sendM.isPending]);

  const messages = messagesQ.data ?? [];

  // Optimistic user message while the mutation is in flight.
  const optimistic = useMemo<ChatMessage | null>(() => {
    if (!sendM.isPending) return null;
    return {
      id: 'optimistic',
      conversationId: conversationId ?? '',
      role: 'USER',
      content: sendM.variables ?? '',
      suggestedActions: [],
      durationMs: 0,
      createdAt: new Date().toISOString(),
    };
  }, [sendM.isPending, sendM.variables, conversationId]);

  if (!enabled) return null;
  if (!token) return null;

  async function submit(text: string): Promise<void> {
    const value = text.trim();
    if (!value) return;
    setDraft('');
    try {
      await sendM.mutateAsync(value);
    } catch {
      // Reset input on failure so user can retry
      setDraft(value);
    }
  }

  function handleAction(a: ChatAction): void {
    if (a.send) {
      void submit(a.send);
    } else if (a.href) {
      window.location.href = a.href;
    }
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-lg shadow-brand-500/30 transition hover:scale-105 active:scale-95"
          aria-label="เปิดแชทช่วยเหลือ"
        >
          <ChatBubbleIcon className="h-7 w-7" />
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-auto sm:bottom-24 sm:right-4 sm:w-[380px]">
          <div className="overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-ink-100 sm:rounded-3xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-brand-gradient px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <SparkleIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">พี่ปัน</p>
                  <p className="text-[10px] opacity-80 leading-tight">
                    {handoff === 'BOT'
                      ? 'ผู้ช่วยลูกค้า'
                      : handoff === 'REQUESTED'
                        ? 'กำลังต่อสายเจ้าหน้าที่…'
                        : handoff === 'HUMAN'
                          ? 'เจ้าหน้าที่กำลังตอบ'
                          : 'ปิดเคสแล้ว'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 hover:bg-white/15"
                aria-label="ปิดแชท"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div
              ref={scrollerRef}
              className="max-h-[55vh] min-h-[300px] space-y-3 overflow-y-auto bg-ink-50/40 px-3 py-4 sm:max-h-[60vh]"
            >
              {messages.length === 0 && !messagesQ.isLoading ? (
                <BotBubble>
                  <p>{config?.greetingMessage ?? 'สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ?'}</p>
                  {config?.starterActions?.length ? (
                    <ActionRow
                      actions={config.starterActions}
                      onClick={handleAction}
                    />
                  ) : null}
                </BotBubble>
              ) : null}

              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onAction={handleAction}
                />
              ))}

              {optimistic ? (
                <MessageBubble message={optimistic} onAction={handleAction} />
              ) : null}

              {sendM.isPending ? (
                <BotBubble>
                  <TypingDots />
                </BotBubble>
              ) : null}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(draft);
              }}
              className="flex items-center gap-2 border-t border-ink-100 bg-white px-3 py-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  handoff === 'HUMAN' || handoff === 'REQUESTED'
                    ? 'พิมพ์ข้อความถึงเจ้าหน้าที่…'
                    : 'พิมพ์ข้อความ…'
                }
                className="flex-1 rounded-full border border-ink-100 bg-ink-50/40 px-4 py-2 text-sm outline-none focus:border-brand-300"
                disabled={sendM.isPending}
              />
              <button
                type="submit"
                disabled={!draft.trim() || sendM.isPending}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-white shadow-md shadow-brand-500/30 disabled:opacity-50"
                aria-label="ส่ง"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────────────────────── */

function MessageBubble({
  message,
  onAction,
}: {
  message: ChatMessage;
  onAction: (a: ChatAction) => void;
}): JSX.Element {
  const isUser = message.role === 'USER';
  const isAdmin =
    message.role === 'ASSISTANT' && message.toolName === 'admin_reply';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-brand-gradient text-white'
            : isAdmin
              ? 'bg-accent-violet/10 text-ink-900 ring-1 ring-accent-violet/30'
              : 'bg-white text-ink-900 ring-1 ring-ink-100',
        )}
      >
        {isAdmin ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent-violet">
            เจ้าหน้าที่
          </p>
        ) : null}
        <p>{message.content}</p>
        {message.suggestedActions?.length ? (
          <ActionRow
            actions={message.suggestedActions}
            onClick={onAction}
            tone={isUser ? 'onBrand' : 'normal'}
          />
        ) : null}
      </div>
    </div>
  );
}

function BotBubble({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] rounded-2xl bg-white px-3 py-2 text-sm leading-relaxed text-ink-900 shadow-sm ring-1 ring-ink-100">
        {children}
      </div>
    </div>
  );
}

function ActionRow({
  actions,
  onClick,
  tone = 'normal',
}: {
  actions: ChatAction[];
  onClick: (a: ChatAction) => void;
  tone?: 'normal' | 'onBrand';
}): JSX.Element {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {actions.map((a, i) => (
        <button
          key={`${a.label}-${i}`}
          type="button"
          onClick={() => onClick(a)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition active:scale-95',
            tone === 'onBrand'
              ? 'bg-white/20 text-white hover:bg-white/30'
              : 'bg-brand-50 text-brand-700 hover:bg-brand-100',
          )}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

function TypingDots(): JSX.Element {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-300 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-300 [animation-delay:200ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-300 [animation-delay:400ms]" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Icons (no extra deps)
 * ────────────────────────────────────────────────────────────────────────── */

function ChatBubbleIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2 13.5 8.5 20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z" />
    </svg>
  );
}
