import { useState, type ReactNode } from 'react';
import { LuRotateCcw, LuTriangleAlert, LuChevronDown, LuChevronUp, LuLifeBuoy, LuArrowLeft, LuLoader } from 'react-icons/lu';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: Error | { code?: string; message?: string; status?: number; details?: any } | null;
  requestId?: string;
  onRetry: () => Promise<void> | void;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
  isInline?: boolean;
  className?: string;
}

export function ErrorState({
  title = "We couldn't load this information",
  message = "A temporary server hiccup or network delay prevented this request from completing. Your progress has not been lost.",
  error,
  requestId,
  onRetry,
  onSecondaryAction,
  secondaryActionLabel = 'Return to Home',
  isInline = false,
  className = '',
}: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await Promise.resolve(onRetry());
      setRetryCount((c) => c + 1);
    } catch {
      setRetryCount((c) => c + 1);
    } finally {
      setRetrying(false);
    }
  };

  const isExhausted = retryCount >= 3;

  // Inline variant for cards / widgets / subcomponents
  if (isInline) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className={`flex flex-col items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/50 p-4 text-center sm:flex-row sm:text-left dark:border-red-900/50 dark:bg-red-950/20 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
            <LuTriangleAlert size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">
              {isExhausted ? 'Multiple retries failed' : title}
            </p>
            <p className="text-xs text-ink-soft">
              {isExhausted
                ? 'Please check back in a few minutes or contact support.'
                : 'Unable to refresh this section.'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-bold text-cream shadow-sm hover:bg-brand-500 disabled:opacity-60"
          >
            {retrying ? (
              <LuLoader size={13} className="animate-spin" />
            ) : (
              <LuRotateCcw size={13} />
            )}
            {retrying ? 'Retrying…' : isExhausted ? 'Try Once More' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  // Full-screen / full-card component variant
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`mx-auto flex w-full max-w-lg flex-col items-center rounded-3xl border-2 border-black bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:p-12 ${className}`}
    >
      {/* Alert Icon */}
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-black bg-amber-500/10 text-amber-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <LuTriangleAlert size={32} />
      </div>

      {/* Heading */}
      <h3 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {isExhausted ? 'Still unable to connect' : title}
      </h3>

      {/* Human friendly message */}
      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-soft sm:text-base">
        {isExhausted
          ? 'We have attempted to reconnect several times without success. Our technical team has been notified. You can contact support or return to the main catalog.'
          : message}
      </p>

      {/* Actions */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand px-6 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95 disabled:opacity-60"
        >
          {retrying ? (
            <LuLoader size={16} className="animate-spin" />
          ) : (
            <LuRotateCcw size={16} />
          )}
          {retrying ? 'Retrying…' : isExhausted ? 'Try Again Once More' : 'Retry Now'}
        </button>

        {isExhausted ? (
          <a
            href="mailto:support@busgosouth.in?subject=Connection%20Issue%20Help"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-extrabold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
          >
            <LuLifeBuoy size={16} />
            Contact Support
          </a>
        ) : (
          <button
            type="button"
            onClick={onSecondaryAction ?? (() => window.history.back())}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-extrabold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
          >
            <LuArrowLeft size={16} />
            {secondaryActionLabel}
          </button>
        )}
      </div>

      {/* Collapsed Technical Details for support */}
      <div className="mt-6 w-full border-t border-ink/10 pt-4 text-left">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex w-full items-center justify-between text-xs font-semibold text-ink-soft hover:text-ink"
        >
          <span>Diagnostic Details {requestId ? `(ID: ${requestId})` : ''}</span>
          {showDetails ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
        </button>

        {showDetails && (
          <div className="mt-2.5 rounded-lg border border-ink/10 bg-surface-tint p-3 font-mono text-xs text-ink-soft">
            <div>
              <strong className="text-ink">Timestamp:</strong> {new Date().toISOString()}
            </div>
            {requestId && (
              <div>
                <strong className="text-ink">Request ID:</strong> {requestId}
              </div>
            )}
            {error && (
              <div className="mt-1">
                <strong className="text-ink">Error:</strong>{' '}
                {'code' in error && error.code ? `[${error.code}] ` : ''}
                {error.message || String(error)}
              </div>
            )}
            <div className="mt-1 text-[11px] opacity-75">
              Retries attempted: {retryCount} / 3 limit
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
