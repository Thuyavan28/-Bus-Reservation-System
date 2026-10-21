import type { ReactNode } from 'react';
import { LuCheck, LuArrowRight, LuDownload, LuTicket, LuSparkles } from 'react-icons/lu';

export interface SuccessDetailItem {
  label: string;
  value: ReactNode;
  hint?: string;
}

export interface SuccessStateProps {
  celebration?: 'strong' | 'routine';
  title?: string;
  message?: string;
  referenceNumber?: string;
  details?: SuccessDetailItem[];
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

export function SuccessState({
  celebration = 'strong',
  title = 'Booking Confirmed!',
  message = 'Your payment has been successfully processed and your seats are guaranteed.',
  referenceNumber,
  details = [],
  primaryAction,
  secondaryAction,
  className = '',
}: SuccessStateProps) {
  const isStrong = celebration === 'strong';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mx-auto flex w-full max-w-xl flex-col items-center rounded-2xl border border-ink/10 bg-card p-6 text-center shadow-card sm:p-10 ${className}`}
    >
      {/* Icon with celebratory ring */}
      <div className="relative mb-5 flex items-center justify-center">
        {isStrong && (
          <span
            className="absolute -inset-2 animate-ping2 rounded-full bg-emerald-500/20"
            aria-hidden="true"
          />
        )}
        <div
          className={`relative grid h-16 w-16 place-items-center rounded-2xl ${
            isStrong
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-8 ring-emerald-500/10'
              : 'bg-emerald-50 text-emerald-700 ring-4 ring-emerald-500/10 dark:bg-emerald-950/40 dark:text-emerald-300'
          }`}
        >
          {isStrong ? <LuCheck size={32} strokeWidth={2.5} /> : <LuSparkles size={24} />}
        </div>
      </div>

      {/* Confirmation Heading */}
      <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
        {title}
      </h2>

      {/* Reference number badge */}
      {referenceNumber && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-surface-tint px-3 py-1 text-xs font-mono font-bold text-ink-soft">
          <span>Ref ID:</span>
          <span className="text-ink">{referenceNumber}</span>
        </div>
      )}

      {/* Explanatory message */}
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft sm:text-base">
        {message}
      </p>

      {/* Key Details Card */}
      {details.length > 0 && (
        <div className="mt-6 w-full divide-y divide-ink/5 rounded-xl border border-ink/10 bg-surface-tint/50 text-left">
          {details.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                {item.label}
              </span>
              <div className="text-right">
                <span className="font-bold text-ink">{item.value}</span>
                {item.hint && <span className="block text-[11px] text-ink-soft">{item.hint}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Next Actions */}
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {primaryAction ? (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-cream shadow-cta transition hover:bg-brand-500 active:scale-95 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {primaryAction.label}
            {primaryAction.icon || <LuTicket size={16} aria-hidden="true" />}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-cream shadow-cta transition hover:bg-brand-500 active:scale-95"
          >
            View Ticket
            <LuArrowRight size={16} aria-hidden="true" />
          </button>
        )}

        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-ink/20 bg-card px-5 py-3 text-sm font-semibold text-ink transition hover:bg-ink/5 active:scale-95 focus-visible:ring-2 focus-visible:ring-ink"
          >
            {secondaryAction.icon || <LuDownload size={16} aria-hidden="true" />}
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
