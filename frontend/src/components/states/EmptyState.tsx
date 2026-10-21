import type { ReactNode } from 'react';
import { LuCompass, LuSearchX, LuCheckCheck, LuArrowRight, LuUndo2, LuFilterX } from 'react-icons/lu';

export type EmptyVariant = 'first-use' | 'no-results' | 'cleared';

export interface EmptyStateProps {
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  className?: string;
}

const DEFAULTS: Record<EmptyVariant, { title: string; desc: string; actionLabel: string; Icon: typeof LuCompass }> = {
  'first-use': {
    title: 'No bookings yet',
    desc: 'When you book a journey, your tickets, live boarding gates, and bus tracking will appear here.',
    actionLabel: 'Search Available Buses',
    Icon: LuCompass,
  },
  'no-results': {
    title: 'No buses match your filters',
    desc: 'Try broadening your departure time, choosing another operator, or clearing active filters.',
    actionLabel: 'Clear All Filters',
    Icon: LuSearchX,
  },
  'cleared': {
    title: 'All caught up',
    desc: 'You have cleared all items in this list. Everything is completed and up to date.',
    actionLabel: 'Browse Routes',
    Icon: LuCheckCheck,
  },
};

export function EmptyState({
  variant = 'no-results',
  title,
  description,
  primaryAction,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  const d = DEFAULTS[variant];
  const Icon = d.Icon;

  return (
    <div
      role="region"
      aria-label={title || d.title}
      className={`mx-auto flex w-full max-w-lg flex-col items-center justify-center rounded-3xl border-2 border-black bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:p-12 ${className}`}
    >
      {/* Visual icon badge */}
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-black bg-brand/10 text-brand shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <Icon size={30} aria-hidden="true" />
      </div>

      {/* Heading */}
      <h3 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
        {title || d.title}
      </h3>

      {/* Value explanation */}
      <p className="mt-2.5 max-w-sm text-sm font-medium leading-relaxed text-ink-soft sm:text-base">
        {description || d.desc}
      </p>

      {/* Action group */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        {primaryAction ? (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand px-6 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
          >
            {primaryAction.label}
            {primaryAction.icon || <LuArrowRight size={16} aria-hidden="true" />}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand px-6 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
          >
            {d.actionLabel}
            <LuArrowRight size={16} aria-hidden="true" />
          </button>
        )}

        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-extrabold text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:bg-ink/5 active:scale-95"
          >
            {secondaryAction.icon || (variant === 'cleared' ? <LuUndo2 size={16} /> : <LuFilterX size={16} />)}
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
