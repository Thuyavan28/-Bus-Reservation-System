import type { ReactNode } from 'react';
import {
  LuShieldAlert,
  LuMapPin,
  LuBell,
  LuCamera,
  LuLock,
  LuArrowLeft,
  LuExternalLink,
  LuRotateCcw,
  LuKeyRound,
} from 'react-icons/lu';

export type PermissionKind = 'device-location' | 'device-notifications' | 'device-camera' | 'account-role';

export interface PermissionDeniedProps {
  kind: PermissionKind;
  isPermanentlyDenied?: boolean;
  onRequestPermission?: () => void;
  onFallbackAction?: () => void;
  fallbackLabel?: string;
  onSafeReturn?: () => void;
  className?: string;
}

const CONFIG: Record<
  PermissionKind,
  {
    title: string;
    whyNeeded: string;
    lossImpact: string;
    actionLabel: string;
    fallbackLabel: string;
    Icon: typeof LuMapPin;
  }
> = {
  'device-location': {
    title: 'Location access is required for real-time tracking',
    whyNeeded: 'We use your current coordinates to show your nearest boarding bus stop and estimate walking time.',
    lossImpact: 'Without location access, you can still search routes manually by typing your city name.',
    actionLabel: 'Allow Location Access',
    fallbackLabel: 'Enter City or Stop Manually',
    Icon: LuMapPin,
  },
  'device-notifications': {
    title: 'Enable notifications for bus arrival alerts',
    whyNeeded: 'BusGo South sends real-time push alerts 15 minutes before your bus reaches the boarding gate and updates on delays.',
    lossImpact: 'Without notifications, you will need to keep this tab open and refresh the live tracking screen manually.',
    actionLabel: 'Enable Boarding Alerts',
    fallbackLabel: 'Continue with SMS Updates',
    Icon: LuBell,
  },
  'device-camera': {
    title: 'Camera permission required for ticket QR scanner',
    whyNeeded: 'The scanner uses your camera to quickly validate passenger tickets and conductor digital passes.',
    lossImpact: 'Without camera access, you can enter the 8-character Ticket Reference ID by hand.',
    actionLabel: 'Enable Camera',
    fallbackLabel: 'Enter Ticket ID Manually',
    Icon: LuCamera,
  },
  'account-role': {
    title: 'Operator Console Access Restricted (403)',
    whyNeeded: 'This dashboard is reserved for verified fleet operators and transit system administrators.',
    lossImpact: 'Your current passenger account does not have operator dispatch permissions.',
    actionLabel: 'Request Operator Access',
    fallbackLabel: 'Return to Passenger Home',
    Icon: LuLock,
  },
};

export function PermissionDeniedState({
  kind,
  isPermanentlyDenied = false,
  onRequestPermission,
  onFallbackAction,
  fallbackLabel,
  onSafeReturn,
  className = '',
}: PermissionDeniedProps) {
  const c = CONFIG[kind];
  const Icon = c.Icon;
  const isDevice = kind.startsWith('device');

  return (
    <div
      role="region"
      aria-label={c.title}
      className={`mx-auto flex w-full max-w-lg flex-col items-center rounded-3xl border-2 border-black bg-white p-8 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:p-12 ${className}`}
    >
      {/* Icon */}
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border-2 border-black bg-amber-500/10 text-amber-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <Icon size={32} />
      </div>

      {/* Calm heading */}
      <h3 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {c.title}
      </h3>

      {/* Why needed & What you lose */}
      <div className="mt-3.5 space-y-2 text-left">
        <div className="rounded-xl border border-ink/10 bg-surface-tint p-3.5 text-xs text-ink-soft sm:text-sm">
          <p className="font-semibold text-ink">Why this is needed:</p>
          <p className="mt-1 leading-relaxed">{c.whyNeeded}</p>
        </div>

        <div className="rounded-xl border border-ink/10 bg-surface-tint/50 p-3.5 text-xs text-ink-soft sm:text-sm">
          <p className="font-semibold text-ink">What happens if you decline:</p>
          <p className="mt-1 leading-relaxed">{c.lossImpact}</p>
        </div>
      </div>

      {/* Permanently denied browser instructions */}
      {isDevice && isPermanentlyDenied && (
        <div className="mt-4 w-full rounded-xl border border-amber-300/60 bg-amber-50/80 p-3 text-left text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-bold">Permission was blocked in your browser settings:</p>
          <ol className="mt-1 list-decimal pl-4 space-y-0.5">
            <li>Click the lock or site settings icon next to the URL bar.</li>
            <li>Change permission to <strong>"Allow"</strong>.</li>
            <li>Reload this page to apply changes.</li>
          </ol>
        </div>
      )}

      {/* Account 403 contact guidance */}
      {kind === 'account-role' && (
        <div className="mt-4 w-full rounded-xl border border-ink/10 bg-surface-tint p-3 text-left text-xs text-ink-soft">
          <p className="font-semibold text-ink">Need operator credentials?</p>
          <p className="mt-0.5">
            Contact your depot transit coordinator or email{' '}
            <a href="mailto:admin@busgosouth.in" className="font-bold text-brand underline">
              admin@busgosouth.in
            </a>{' '}
            to grant operator role to your profile.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        {isDevice && !isPermanentlyDenied ? (
          <button
            type="button"
            onClick={onRequestPermission}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand px-6 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
          >
            <LuRotateCcw size={16} />
            {c.actionLabel}
          </button>
        ) : kind === 'account-role' ? (
          <a
            href="mailto:admin@busgosouth.in?subject=Operator%20Role%20Request"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand px-6 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
          >
            <LuKeyRound size={16} />
            {c.actionLabel}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand px-6 py-2.5 text-sm font-extrabold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
          >
            <LuRotateCcw size={16} />
            Refresh After Granting Permission
          </button>
        )}

        {/* Fallback path (Manual entry / safe return) */}
        <button
          type="button"
          onClick={onFallbackAction || onSafeReturn || (() => window.history.back())}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-extrabold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
        >
          <LuArrowLeft size={16} />
          {fallbackLabel || c.fallbackLabel}
        </button>
      </div>
    </div>
  );
}
