import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function GlassCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn(
        'glass rounded-3xl p-4 transition',
        className,
      )}
      {...rest}
    />
  );
}

export function GlassStrong({ className, ...rest }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('glass-strong rounded-3xl p-4', className)} {...rest} />;
}

export function MeshBackdrop({
  variant = 'soft',
  className,
}: {
  variant?: 'soft' | 'strong';
  className?: string;
}): JSX.Element {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10',
        variant === 'soft' ? 'bg-mesh-soft' : 'bg-mesh',
        className,
      )}
    />
  );
}

export function Orb({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute rounded-full blur-3xl animate-float',
        className,
      )}
      style={style}
    />
  );
}
