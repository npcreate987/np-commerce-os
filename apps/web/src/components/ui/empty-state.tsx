import { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-ink-200 bg-ink-50/60 p-8 text-center">
      {icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand shadow-soft">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {description ? <p className="text-xs text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
