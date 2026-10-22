import { useState, type ReactNode } from 'react';
import {
  LuCircleAlert,
  LuRotateCcw,
  LuClock,
  LuLoader,
  LuMinus,
} from 'react-icons/lu';

/** Helper to format missing fields as explicit deliberate placeholder */
export function ValueOrPlaceholder({
  value,
  placeholder = 'Not available',
  className = '',
}: {
  value: any;
  placeholder?: string;
  className?: string;
}) {
  if (value === undefined || value === null || value === '' || Number.isNaN(value)) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs italic text-ink-soft/70 ${className}`}
        aria-label="Value not available"
      >
        <LuMinus size={11} className="inline opacity-50" />
        {placeholder}
      </span>
    );
  }
  return <>{value}</>;
}

/** Top-level subtle banner when page data is partially incomplete */
export function PartialDataBanner({
  message = "Some live updates couldn't be loaded. Showing latest available information.",
  onRetry,
  lastUpdated,
  className = '',
}: {
  message?: string;
  onRetry?: () => Promise<void> | void;
  lastUpdated?: string | Date;
  className?: string;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await Promise.resolve(onRetry());
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200 ${className}`}
    >
      <div className="flex items-center gap-2">
        <LuCircleAlert size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <span>{message}</span>
        {lastUpdated && (
          <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-medium dark:bg-amber-900/40">
            <LuClock size={12} />
            <span>Updated {typeof lastUpdated === 'string' ? lastUpdated : lastUpdated.toLocaleTimeString()}</span>
          </span>
        )}
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
        >
          {retrying ? <LuLoader size={12} className="animate-spin" /> : <LuRotateCcw size={12} />}
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

/** Pagination / Infinite scroll bottom failure card */
export function PaginationErrorIndicator({
  onRetry,
  className = '',
}: {
  onRetry: () => Promise<void> | void;
  className?: string;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await Promise.resolve(onRetry());
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      className={`my-4 flex items-center justify-center gap-3 rounded-2xl border-2 border-black bg-white p-4 text-center text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-900 ${className}`}
    >
      <span className="text-xs font-bold text-ink">
        Couldn't load more results
      </span>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-black bg-brand px-3 py-1.5 text-xs font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95 disabled:opacity-60"
      >
        {retrying ? <LuLoader size={13} className="animate-spin" /> : <LuRotateCcw size={13} />}
        {retrying ? 'Loading…' : 'Retry'}
      </button>
    </div>
  );
}

/** Compact per-section partial error widget */
export function SectionErrorWidget({
  title = "This section couldn't be loaded",
  onRetry,
  className = '',
}: {
  title?: string;
  onRetry: () => Promise<void> | void;
  className?: string;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await Promise.resolve(onRetry());
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      className={`flex items-center justify-between rounded-2xl border-2 border-black bg-white p-3.5 text-xs text-ink shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-white dark:bg-zinc-900 ${className}`}
    >
      <span className="font-extrabold text-ink">{title}</span>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="inline-flex items-center gap-1 rounded-xl border-2 border-black bg-white px-3 py-1.5 text-xs font-extrabold text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
      >
        {retrying ? <LuLoader size={12} className="animate-spin" /> : <LuRotateCcw size={12} />}
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
