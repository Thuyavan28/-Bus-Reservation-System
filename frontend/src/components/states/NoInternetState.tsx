import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { LuWifiOff, LuRotateCcw, LuCheck, LuCloudOff, LuLoader, LuDatabase } from 'react-icons/lu';

export interface NoInternetStateProps {
  onRetry?: () => Promise<boolean | void> | boolean | void;
  hasCachedData?: boolean;
  pendingQueuedWritesCount?: number;
  className?: string;
}

/** Hook that reliably tracks network connectivity using both browser events and actual endpoint probing. */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [justReconnected, setJustReconnected] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    setChecking(true);
    try {
      // Lightweight probe with cache busting
      const res = await fetch(`/api/health?_t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
        .catch(() => fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' }));
      const reachable = res.ok || res.status < 500;
      setIsOnline(reachable);
      return reachable;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      void checkConnectivity().then((online) => {
        if (online) {
          setJustReconnected(true);
          const timer = setTimeout(() => setJustReconnected(false), 4500);
          return () => clearTimeout(timer);
        }
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnectivity]);

  return { isOnline, justReconnected, checking, checkConnectivity };
}

/** Global banner shown when offline or when reconnected */
export function ConnectivityBanner({
  hasCachedData = false,
  queuedWritesCount = 0,
  onManualRetry,
}: {
  hasCachedData?: boolean;
  queuedWritesCount?: number;
  onManualRetry?: () => void;
}) {
  const { isOnline, justReconnected, checking, checkConnectivity } = useNetworkStatus();

  if (justReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-emerald-600 bg-emerald-600 px-4 py-2.5 text-center text-xs font-bold text-white shadow-md animate-fadeDown"
      >
        <LuCheck size={16} />
        <span>Back online! Connection successfully restored.</span>
      </div>
    );
  }

  if (!isOnline && hasCachedData) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-600/30 bg-amber-500/90 px-4 py-2 text-xs font-semibold text-white shadow-md backdrop-blur-md"
      >
        <div className="flex items-center gap-2">
          <LuDatabase size={15} />
          <span>Offline mode — showing saved data from last sync.</span>
          {queuedWritesCount > 0 && (
            <span className="rounded bg-black/20 px-2 py-0.5 text-[11px] font-mono">
              {queuedWritesCount} actions pending sync
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            void checkConnectivity();
            onManualRetry?.();
          }}
          disabled={checking}
          className="inline-flex items-center gap-1.5 rounded-lg bg-black/25 px-2.5 py-1 text-xs font-bold text-white hover:bg-black/40"
        >
          {checking ? <LuLoader size={12} className="animate-spin" /> : <LuRotateCcw size={12} />}
          {checking ? 'Checking…' : 'Try Again'}
        </button>
      </div>
    );
  }

  return null;
}

/** Full-screen / container No Internet state */
export function NoInternetState({
  onRetry,
  hasCachedData = false,
  pendingQueuedWritesCount = 0,
  className = '',
}: NoInternetStateProps) {
  const { checking, checkConnectivity } = useNetworkStatus();
  const [localChecking, setLocalChecking] = useState(false);

  const handleTryAgain = async () => {
    setLocalChecking(true);
    try {
      const reachable = await checkConnectivity();
      if (reachable && onRetry) {
        await Promise.resolve(onRetry());
      }
    } finally {
      setLocalChecking(false);
    }
  };

  const isBusy = checking || localChecking;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`mx-auto flex w-full max-w-lg flex-col items-center rounded-2xl border border-ink/10 bg-card p-6 text-center shadow-card sm:p-10 ${className}`}
    >
      {/* Visual offline icon */}
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 ring-8 ring-amber-500/5 dark:bg-amber-500/20 dark:text-amber-400">
        <LuWifiOff size={32} />
      </div>

      {/* Clear Heading */}
      <h3 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
        You're offline
      </h3>

      {/* Clear connection message */}
      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-soft sm:text-base">
        Check your Wi-Fi or cellular mobile data connection. As soon as connectivity returns, your session will automatically resume.
      </p>

      {/* Pending changes badge */}
      {pendingQueuedWritesCount > 0 && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <LuCloudOff size={15} />
          <span>{pendingQueuedWritesCount} action(s) queued to sync once back online</span>
        </div>
      )}

      {hasCachedData && (
        <p className="mt-3 text-xs text-ink-soft">
          Cached schedule and route information can still be viewed in offline mode.
        </p>
      )}

      {/* Try Again CTA */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleTryAgain}
          disabled={isBusy}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-cream shadow-cta transition hover:bg-brand-500 active:scale-95 disabled:opacity-60"
        >
          {isBusy ? (
            <LuLoader size={16} className="animate-spin" />
          ) : (
            <LuRotateCcw size={16} />
          )}
          {isBusy ? 'Checking Connection…' : 'Try Again'}
        </button>
      </div>
    </div>
  );
}
