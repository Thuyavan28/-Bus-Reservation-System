import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { LuLock, LuLogIn, LuClock, LuShieldCheck, LuRotateCcw } from 'react-icons/lu';
import { useNavigate, useLocation } from 'react-router-dom';

export interface SessionExpiredProps {
  savedDraftSummary?: string;
  onSignInAgain?: () => void;
  returnUrl?: string;
  className?: string;
}

/** Component and modal for session expiration */
export function SessionExpiredModal({
  isOpen,
  savedDraftSummary = 'Your seat selections, passenger names, and booking drafts have been safely preserved.',
  onClose,
}: {
  isOpen: boolean;
  savedDraftSummary?: string;
  onClose?: () => void;
}) {
  const nav = useNavigate();
  const loc = useLocation();

  if (!isOpen) return null;

  const handleSignIn = () => {
    // Preserve current URL so user returns right here after re-authenticating
    const currentPath = loc.pathname + loc.search;
    onClose?.();
    nav('/login', { state: { from: currentPath, preservedDraft: true } });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade"
    >
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-card p-6 text-center shadow-2xl animate-pop sm:p-8">
        {/* Lock badge */}
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand/10 text-brand ring-8 ring-brand/5">
          <LuLock size={28} />
        </div>

        {/* Heading */}
        <h3 id="session-expired-title" className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
          Session timed out
        </h3>

        {/* Human explanation */}
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          For your security and ticket protection, your session ended due to inactivity.
        </p>

        {/* Preserved unsaved work notice */}
        {savedDraftSummary && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-50/70 p-3 text-left text-xs text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            <LuShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-bold">Your progress is saved</p>
              <p className="mt-0.5">{savedDraftSummary}</p>
            </div>
          </div>
        )}

        {/* Primary CTA: Sign In Again */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleSignIn}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-cream shadow-cta transition hover:bg-brand-500 active:scale-95"
          >
            <LuLogIn size={16} />
            Sign In to Continue
          </button>
        </div>
      </div>
    </div>
  );
}

/** Idle timeout warning dialog: warns 2 minutes before idle expiration */
export function IdleWarningModal({
  isOpen,
  remainingSeconds = 120,
  onStaySignedIn,
}: {
  isOpen: boolean;
  remainingSeconds?: number;
  onStaySignedIn: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      className="fixed inset-0 z-[105] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade"
    >
      <div className="w-full max-w-sm rounded-2xl border border-amber-300 bg-card p-6 text-center shadow-2xl animate-pop">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          <LuClock size={24} />
        </div>
        <h3 id="idle-warning-title" className="text-lg font-bold text-ink">
          Are you still there?
        </h3>
        <p className="mt-1.5 text-xs text-ink-soft">
          You will be safely signed out in{' '}
          <strong className="text-brand font-mono">{remainingSeconds}s</strong> due to inactivity.
        </p>
        <button
          type="button"
          onClick={onStaySignedIn}
          className="mt-5 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-xs font-bold text-cream shadow-cta hover:bg-brand-500"
        >
          <LuRotateCcw size={14} />
          Stay Signed In
        </button>
      </div>
    </div>
  );
}

/** Full-page session expired state */
export function SessionExpiredState({
  savedDraftSummary = 'Your recent ticket selection and passenger details have been saved in browser memory.',
  onSignInAgain,
  returnUrl,
  className = '',
}: SessionExpiredProps) {
  const nav = useNavigate();
  const loc = useLocation();

  const handleSignIn = () => {
    if (onSignInAgain) {
      onSignInAgain();
      return;
    }
    const target = returnUrl || loc.pathname + loc.search;
    nav('/login', { state: { from: target, preservedDraft: true } });
  };

  return (
    <div
      role="region"
      aria-label="Session expired"
      className={`mx-auto flex w-full max-w-lg flex-col items-center rounded-2xl border border-ink/10 bg-card p-6 text-center shadow-card sm:p-10 ${className}`}
    >
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-brand/10 text-brand ring-8 ring-brand/5">
        <LuLock size={30} />
      </div>

      <h3 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
        For your security, you've been signed out
      </h3>

      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-soft sm:text-base">
        Your authentication session expired. We saved your form and booking draft so you can pick up exactly where you left off.
      </p>

      {savedDraftSummary && (
        <div className="mt-4 flex w-full items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-50/60 p-3 text-left text-xs text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-200">
          <LuShieldCheck size={16} className="shrink-0 text-emerald-600" />
          <span>{savedDraftSummary}</span>
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleSignIn}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-cream shadow-cta transition hover:bg-brand-500 active:scale-95"
        >
          <LuLogIn size={16} />
          Sign In Again
        </button>

        <button
          type="button"
          onClick={() => nav('/home')}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-ink/20 bg-card px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-ink/5 active:scale-95"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
}
