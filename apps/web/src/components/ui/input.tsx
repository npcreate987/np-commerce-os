'use client';

import { InputHTMLAttributes, forwardRef, ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';
import { EyeIcon, EyeOffIcon } from '../icons';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightAddon?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightAddon, className, type = 'text', id, ...rest },
  ref,
) {
  const [showPw, setShowPw] = useState(false);
  const isPw = type === 'password';
  const realType = isPw && showPw ? 'text' : type;
  const inputId = id || rest.name || (label ? `inp-${label}` : undefined);

  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-xs font-semibold text-ink-600">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          'group relative flex h-12 items-center rounded-2xl border bg-white transition focus-within:ring-4',
          error
            ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-100'
            : 'border-ink-100 focus-within:border-brand focus-within:ring-brand/15',
        )}
      >
        {leftIcon ? (
          <span className="flex h-full items-center pl-3 text-ink-400">{leftIcon}</span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          type={realType}
          className={cn(
            'block h-full w-full bg-transparent text-base outline-none placeholder:text-ink-300',
            leftIcon ? 'pl-2' : 'pl-4',
            isPw || rightAddon ? 'pr-12' : 'pr-4',
            className,
          )}
          {...rest}
        />
        {isPw ? (
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-ink-400 hover:text-ink-700"
            aria-label={showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : rightAddon ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">
            {rightAddon}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
});
