import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SpinnerIcon } from '../icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-glow hover:brightness-105 active:brightness-95 disabled:opacity-50 disabled:shadow-none',
  secondary:
    'bg-ink-50 text-ink-900 hover:bg-ink-100 active:bg-ink-200 disabled:opacity-50',
  outline:
    'bg-white text-ink-900 border border-ink-200 hover:border-ink-300 active:bg-ink-50 disabled:opacity-50',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-50 active:bg-ink-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-4 text-sm rounded-2xl gap-2',
  lg: 'h-14 px-5 text-base rounded-2xl gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth,
    loading,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition active:scale-[0.985]',
        variantClass[variant],
        sizeClass[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <SpinnerIcon className="h-4 w-4" />
      ) : leftIcon ? (
        <span className="-ml-0.5 flex h-4 w-4 items-center">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!loading && rightIcon ? (
        <span className="-mr-0.5 flex h-4 w-4 items-center">{rightIcon}</span>
      ) : null}
    </button>
  );
});
