'use client';

import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/cn';
import type { SVGProps } from 'react';

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function SunIcon(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(p: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg {...base} {...p}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'pill';
}

export function ThemeToggle({ className, variant = 'icon' }: ThemeToggleProps): JSX.Element {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-surface bg-surface-raised px-3 py-1.5 text-xs font-semibold text-surface-strong shadow-card transition hover:shadow-soft active:scale-95',
          className,
        )}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
        <span>{isDark ? 'โหมดมืด' : 'โหมดสว่าง'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-2xl border border-surface bg-surface-raised text-surface-strong transition hover:shadow-soft active:scale-95',
        className,
      )}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
