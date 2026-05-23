'use client';

import { cn } from '@/lib/cn';

interface StarProps {
  filled: number; // 0..1
  className?: string;
}

function Star({ filled, className }: StarProps): JSX.Element {
  const pct = Math.max(0, Math.min(1, filled)) * 100;
  return (
    <span
      className={cn('relative inline-block h-4 w-4 shrink-0', className)}
      aria-hidden
    >
      <span className="absolute inset-0 text-ink-200">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-amber-400"
        style={{ width: `${pct}%` }}
      >
        ★
      </span>
    </span>
  );
}

/** Read-only star display — supports fractional ratings (4.3 etc.) */
export function StarRating({
  value,
  size = 'sm',
  className,
}: {
  value: number; // 0..5
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}): JSX.Element {
  const dim = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      aria-label={`${value.toFixed(1)} ดาว`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = Math.max(0, Math.min(1, value - i));
        return <Star key={i} filled={filled} className={dim} />;
      })}
    </span>
  );
}

/** Compact "★ 4.5 (123)" pill */
export function RatingPill({
  avg,
  count,
  className,
}: {
  avg: number;
  count: number;
  className?: string;
}): JSX.Element | null {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200',
        className,
      )}
    >
      <span className="text-sm leading-none">★</span>
      {avg.toFixed(1)}
      <span className="text-amber-500/80">({count})</span>
    </span>
  );
}

/** Interactive star picker for review form */
export function StarPicker({
  value,
  onChange,
  size = 'lg',
}: {
  value: number;
  onChange: (v: number) => void;
  size?: 'md' | 'lg';
}): JSX.Element {
  const dim = size === 'lg' ? 'h-8 w-8 text-2xl' : 'h-6 w-6 text-xl';
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => {
        const active = i <= value;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              'flex items-center justify-center transition active:scale-90',
              dim,
              active ? 'text-amber-400' : 'text-ink-200',
            )}
            aria-label={`ให้ ${i} ดาว`}
          >
            ★
          </button>
        );
      })}
      <span className="ml-2 text-xs font-semibold text-ink-500">
        {value > 0 ? `${value}/5` : 'เลือกคะแนน'}
      </span>
    </div>
  );
}
