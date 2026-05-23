'use client';

/**
 * Phase 12.2 — Report sheet (bottom-sheet modal) used by the feed video card.
 *
 * Behaviour
 *   • Anonymous users see a "เข้าสู่ระบบเพื่อรายงาน" CTA — no anonymous reports.
 *   • Logged-in users pick one of six categorical reasons; "อื่น ๆ" requires a
 *     note (validated server-side via Zod refine too).
 *   • Submits via `api.feed.report`. On success: success state + auto-close
 *     after 1.4 s. On API conflict (already reported) we surface the friendly
 *     message returned by the server.
 *   • Backdrop click closes the sheet. Esc key also closes (default browser
 *     focus trap on the dialog element).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/cn';
import { FlagIcon } from '@/components/icons';
import type { VideoReportReason } from '@np/types';

const REASONS: Array<{ value: VideoReportReason; label: string; emoji: string }> = [
  { value: 'SPAM',      label: 'สแปม / โฆษณา',         emoji: '📢' },
  { value: 'NUDITY',    label: 'เนื้อหาโป๊ / 18+',       emoji: '🔞' },
  { value: 'VIOLENCE',  label: 'ความรุนแรง',             emoji: '⚠️' },
  { value: 'HATE',      label: 'คำพูดเกลียดชัง',         emoji: '🚫' },
  { value: 'MISINFO',   label: 'ข้อมูลเท็จ / หลอกลวง',   emoji: '❌' },
  { value: 'COPYRIGHT', label: 'ละเมิดลิขสิทธิ์',        emoji: '©️' },
  { value: 'OTHER',     label: 'อื่น ๆ (โปรดอธิบาย)',     emoji: '💬' },
];

interface Props {
  videoId: string;
  open: boolean;
  onClose: () => void;
}

export function ReportSheet({ videoId, open, onClose }: Props): JSX.Element | null {
  const token = useAuthStore((s) => s.token);
  const [reason, setReason] = useState<VideoReportReason | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitM = useMutation({
    mutationFn: () =>
      api.feed.report(token!, videoId, {
        reason: reason!,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setSubmitted(true);
      setError(null);
      // Auto-close after a short success state so the user sees confirmation.
      setTimeout(onClose, 1400);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'ส่งรายงานไม่สำเร็จ');
    },
  });

  // Reset internal state every time the sheet opens for a fresh video.
  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setSubmitted(false);
      setError(null);
    }
  }, [open, videoId]);

  // Close on Escape — small UX nicety for desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="รายงานคลิป"
      className="fixed inset-0 z-[60] flex items-end bg-black/55 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white shadow-pop sm:rounded-3xl">
        <div className="border-b px-5 py-3.5">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink-200 sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
              <FlagIcon className="h-5 w-5 text-rose-500" />
              รายงานคลิป
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-ink-500 hover:bg-ink-100"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            รายงานของคุณจะถูกส่งให้ทีมงานตรวจสอบ — ไม่เปิดเผยตัวตนต่อเจ้าของคลิป
          </p>
        </div>

        {!token ? (
          <div className="p-5 text-center">
            <p className="mb-3 text-sm text-ink-700">
              เข้าสู่ระบบเพื่อรายงานคลิป
            </p>
            <Link
              href={`/login?next=%2Ffeed%3Fv%3D${encodeURIComponent(videoId)}`}
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-brand-gradient px-5 text-sm font-bold text-white shadow-glow active:scale-95"
            >
              เข้าสู่ระบบ
            </Link>
          </div>
        ) : submitted ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <p className="font-semibold text-ink-900">ส่งรายงานแล้ว</p>
            <p className="mt-1 text-xs text-ink-500">
              ทีมงานจะตรวจสอบในเร็ว ๆ นี้ ขอบคุณที่ช่วยรักษาชุมชน
            </p>
          </div>
        ) : (
          <>
            <fieldset className="space-y-1 px-3 py-3">
              <legend className="sr-only">เลือกเหตุผล</legend>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                    reason === r.value
                      ? 'bg-rose-50 ring-1 ring-rose-300'
                      : 'hover:bg-ink-50',
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="h-4 w-4 accent-rose-500"
                  />
                  <span className="text-lg">{r.emoji}</span>
                  <span className="flex-1 text-ink-900">{r.label}</span>
                </label>
              ))}
            </fieldset>

            {reason === 'OTHER' && (
              <div className="px-5 pb-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="โปรดอธิบายให้ทีมงานเข้าใจ"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <p className="mt-1 text-right text-[10px] text-ink-400">
                  {note.length}/500
                </p>
              </div>
            )}

            {error && (
              <p className="mx-5 mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}

            <div className="flex gap-2 border-t p-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={
                  !reason ||
                  submitM.isPending ||
                  (reason === 'OTHER' && note.trim().length === 0)
                }
                onClick={() => submitM.mutate()}
                className="flex-1 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white shadow-glow active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitM.isPending ? 'กำลังส่ง…' : 'ส่งรายงาน'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
