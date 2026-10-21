import { useEffect, useState } from 'react';
import {
  LuSlidersHorizontal,
  LuX,
  LuRotateCcw,
  LuCheck,
  LuTriangleAlert,
  LuWifiOff,
  LuShieldAlert,
  LuSplit,
  LuFileWarning,
  LuLock,
  LuSparkles,
} from 'react-icons/lu';
import { EmptyState } from './EmptyState';
import { SuccessState } from './SuccessState';
import { ErrorState } from './ErrorState';
import { NoInternetState } from './NoInternetState';
import { PermissionDeniedState } from './PermissionDeniedState';
import { PartialDataBanner, PaginationErrorIndicator, SectionErrorWidget, ValueOrPlaceholder } from './PartialDataState';
import { FormErrorSummary, ValidatedField } from './FormValidationErrorState';
import { SessionExpiredModal, IdleWarningModal } from './SessionExpiredState';

export type DevForcedState =
  | 'none'
  | 'empty'
  | 'success'
  | 'error'
  | 'no-internet'
  | 'permission-denied-device'
  | 'permission-denied-role'
  | 'partial-data'
  | 'form-validation'
  | 'session-expired';

export function DevStateSwitcher() {
  // CRITICAL: NEVER show in production builds!
  if (!import.meta.env.DEV) {
    return null;
  }

  const [open, setOpen] = useState(false);
  const [activeState, setActiveState] = useState<DevForcedState>('none');
  const [emptyVariant, setEmptyVariant] = useState<'first-use' | 'no-results' | 'cleared'>('first-use');
  const [errorRetriedTimes, setErrorRetriedTimes] = useState(0);

  // Listen for keyboard shortcut (Ctrl+Shift+S or Cmd+Shift+S), Escape, and URL parameters (?qa=1 or ?states=1)
  useEffect(() => {
    const checkUrlParams = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has('qa') || params.has('states') || params.has('states_modal')) {
        setOpen(true);
      }
      const stateParam = params.get('state');
      if (
        stateParam &&
        [
          'empty',
          'success',
          'error',
          'no-internet',
          'permission-denied-device',
          'permission-denied-role',
          'partial-data',
          'form-validation',
          'session-expired',
        ].includes(stateParam)
      ) {
        setActiveState(stateParam as DevForcedState);
        setOpen(true);
      }
    };

    checkUrlParams();
    window.addEventListener('popstate', checkUrlParams);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
        setActiveState('none');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Global developer console helper
    (window as any).showStatesQA = (state?: DevForcedState) => {
      setOpen(true);
      if (state) setActiveState(state);
    };
    (window as any).hideStatesQA = () => {
      setOpen(false);
      setActiveState('none');
    };

    const handleCustomOpen = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      setOpen(true);
      if (detail?.state) setActiveState(detail.state);
    };
    window.addEventListener('open-states-qa', handleCustomOpen);

    return () => {
      window.removeEventListener('popstate', checkUrlParams);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-states-qa', handleCustomOpen);
      delete (window as any).showStatesQA;
      delete (window as any).hideStatesQA;
    };
  }, [open]);

  // Form validation simulation state
  const [dummyForm, setDummyForm] = useState({ name: '', phone: '', age: '' });
  const [dummyErrors] = useState<Array<{ fieldId: string; fieldLabel: string; message: string }>>([
    { fieldId: 'passenger-name', fieldLabel: 'Passenger Full Name', message: 'Name must be at least 3 letters' },
    { fieldId: 'passenger-phone', fieldLabel: 'Mobile Number', message: 'Enter a valid 10-digit Indian mobile number' },
    { fieldId: 'passenger-age', fieldLabel: 'Passenger Age', message: 'Age must be between 1 and 120' },
  ]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="UX States QA Simulation Popup"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/75 backdrop-blur-md p-4 sm:p-6 overflow-y-auto animate-fade-in"
    >
      <div className="relative flex flex-col max-h-[92vh] w-full max-w-3xl rounded-3xl border-2 border-ink/20 bg-card p-6 shadow-2xl overflow-hidden">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-ink/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-cream shadow-sm">
              <LuSlidersHorizontal size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight text-ink">UX States QA Popup</h3>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-black uppercase text-brand tracking-wider">
                  Dev Mode
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {activeState === 'none'
                  ? 'Select any required UX state below to test interactive behavior in this popup'
                  : `Currently viewing: ${activeState.replace(/-/g, ' ').toUpperCase()}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeState !== 'none' && (
              <button
                type="button"
                onClick={() => setActiveState('none')}
                className="flex items-center gap-1.5 rounded-full border border-ink/20 bg-surface-tint px-3 py-1.5 text-xs font-bold text-ink hover:bg-ink/10 transition"
              >
                <span>← All Scenarios</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setActiveState('none');
              }}
              title="Close Popup (Esc)"
              className="grid h-9 w-9 place-items-center rounded-full border border-ink/20 text-ink hover:bg-ink/10 transition"
            >
              <LuX size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {activeState === 'none' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand/20 bg-brand/5 p-3.5 text-xs text-ink flex items-center justify-between">
                <div>
                  <span className="font-bold">Shortcut tip:</span> Press <kbd className="rounded border border-ink/20 bg-card px-1.5 py-0.5 font-mono text-[11px] font-bold">Ctrl+Shift+S</kbd> anywhere or append <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px] text-brand">?qa=1</code> to the URL to reopen this popup.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 2. Empty */}
                <button
                  type="button"
                  onClick={() => setActiveState('empty')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 2</span>
                    <span className="text-[10px] font-bold text-ink-soft">3 Variants</span>
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">Empty Screen</h4>
                  <p className="mt-1 text-xs text-ink-soft">First-use, zero search results, and cleared filters with primary CTA.</p>
                </button>

                {/* 3. Success */}
                <button
                  type="button"
                  onClick={() => setActiveState('success')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 3</span>
                    <LuCheck className="text-emerald-600" size={16} />
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">Success Screen</h4>
                  <p className="mt-1 text-xs text-ink-soft">Booking confirmation badge, BUS-9482 reference ID, details, and receipt.</p>
                </button>

                {/* 4. Error + Retry */}
                <button
                  type="button"
                  onClick={() => setActiveState('error')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 4</span>
                    <LuTriangleAlert className="text-red-500" size={16} />
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">Error Screen + Retry</h4>
                  <p className="mt-1 text-xs text-ink-soft">Retry loop with 3x exhaustion limit, collapsible technical diagnostics, Request ID.</p>
                </button>

                {/* 5. No Internet */}
                <button
                  type="button"
                  onClick={() => setActiveState('no-internet')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 5</span>
                    <LuWifiOff className="text-amber-500" size={16} />
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">No Internet Screen</h4>
                  <p className="mt-1 text-xs text-ink-soft">Dual offline signal (navigator + API ping), cached read banner, queued writes.</p>
                </button>

                {/* 6. Permission Denied */}
                <button
                  type="button"
                  onClick={() => setActiveState('permission-denied-device')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 6</span>
                    <LuShieldAlert className="text-orange-500" size={16} />
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">Permission Denied</h4>
                  <p className="mt-1 text-xs text-ink-soft">Device GPS location denied vs Account Role 403 Forbidden with escalation.</p>
                </button>

                {/* 7. Partial Data */}
                <button
                  type="button"
                  onClick={() => setActiveState('partial-data')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 7</span>
                    <LuSplit className="text-blue-500" size={16} />
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">Partial Data Screen</h4>
                  <p className="mt-1 text-xs text-ink-soft">Subtle delayed telemetry warning, SectionErrorWidget, pagination recovery.</p>
                </button>

                {/* 8. Form Validation */}
                <button
                  type="button"
                  onClick={() => setActiveState('form-validation')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 8</span>
                    <LuFileWarning className="text-rose-500" size={16} />
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">Form Validation Error</h4>
                  <p className="mt-1 text-xs text-ink-soft">Top summary list with anchor jump links, 4-tier field validation, aria labels.</p>
                </button>

                {/* 9. Session Expired */}
                <button
                  type="button"
                  onClick={() => setActiveState('session-expired')}
                  className="flex flex-col text-left rounded-2xl border border-ink/10 bg-surface-tint/60 p-4 transition hover:border-brand hover:shadow-card group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand uppercase tracking-wider">State 9</span>
                    <LuLock className="text-purple-500" size={16} />
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-ink group-hover:text-brand transition">Session Expired Screen</h4>
                  <p className="mt-1 text-xs text-ink-soft">Safe draft preservation notice, returnUrl redirect, non-destructive re-auth.</p>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {/* State 2: Empty */}
              {activeState === 'empty' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-surface-tint p-2">
                    <span className="text-xs font-bold text-ink">Choose Variant:</span>
                    <div className="flex gap-1.5">
                      {(['first-use', 'no-results', 'cleared'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setEmptyVariant(v)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold capitalize transition ${
                            emptyVariant === v ? 'bg-brand text-cream' : 'border border-ink/10 bg-card text-ink'
                          }`}
                        >
                          {v.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <EmptyState
                    variant={emptyVariant}
                    primaryAction={{
                      label: 'Search Buses Now',
                      onClick: () => setActiveState('none'),
                    }}
                    secondaryAction={{
                      label: 'Back to Selector',
                      onClick: () => setActiveState('none'),
                    }}
                  />
                </div>
              )}

              {/* State 3: Success */}
              {activeState === 'success' && (
                <SuccessState
                  celebration="strong"
                  title="Ticket #BUS-9482 Confirmed!"
                  message="Your booking from Chennai Koyambedu to Bangalore Majestic has been reserved successfully."
                  referenceNumber="BUS-9482-TN"
                  details={[
                    { label: 'Route', value: 'Chennai → Bangalore' },
                    { label: 'Departure', value: 'Today, 21:30 hrs' },
                    { label: 'Seats', value: '12A, 12B (Lower Deck)' },
                    { label: 'Amount Paid', value: '₹1,560 (Confirmed via UPI)' },
                  ]}
                  primaryAction={{
                    label: 'View Ticket',
                    onClick: () => setActiveState('none'),
                  }}
                  secondaryAction={{
                    label: 'Back to Selector',
                    onClick: () => setActiveState('none'),
                  }}
                />
              )}

              {/* State 4: Error + Retry */}
              {activeState === 'error' && (
                <ErrorState
                  title="Failed to retrieve live seat availability"
                  message="The seat inventory cluster timed out responding. Your chosen boarding stop and passenger list have been kept intact."
                  requestId="REQ-84920"
                  error={new Error('Connection timeout to Redis seat lock cluster at port 6379')}
                  onRetry={() => {
                    setErrorRetriedTimes((c) => c + 1);
                  }}
                  onSecondaryAction={() => setActiveState('none')}
                  secondaryActionLabel="Back to Selector"
                />
              )}

              {/* State 5: No Internet */}
              {activeState === 'no-internet' && (
                <NoInternetState
                  hasCachedData={true}
                  pendingQueuedWritesCount={1}
                  onRetry={() => {
                    setActiveState('none');
                  }}
                />
              )}

              {/* State 6: Permission Denied */}
              {activeState === 'permission-denied-device' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveState('permission-denied-role')}
                      className="text-xs font-bold text-brand underline"
                    >
                      Switch to Account Role (403) Preview →
                    </button>
                  </div>
                  <PermissionDeniedState
                    kind="device-location"
                    isPermanentlyDenied={false}
                    onRequestPermission={() => alert('Browser prompt: Location access requested.')}
                    onFallbackAction={() => setActiveState('none')}
                    fallbackLabel="Enter Boarding Point Manually"
                  />
                </div>
              )}

              {activeState === 'permission-denied-role' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveState('permission-denied-device')}
                      className="text-xs font-bold text-brand underline"
                    >
                      Switch to Device GPS Location Preview →
                    </button>
                  </div>
                  <PermissionDeniedState
                    kind="account-role"
                    onFallbackAction={() => setActiveState('none')}
                    fallbackLabel="Return to Passenger Portal"
                  />
                </div>
              )}

              {/* State 7: Partial Data */}
              {activeState === 'partial-data' && (
                <div className="space-y-4">
                  <PartialDataBanner
                    message="Live GPS telemetry is momentarily delayed. Showing confirmed timetable."
                    lastUpdated="6 min ago"
                    onRetry={() => alert('Retrying telemetry fetch...')}
                  />
                  <div className="rounded-2xl border border-ink/10 bg-card p-4 space-y-2">
                    <h4 className="text-sm font-bold text-ink">Trip Overview (Loaded Successfully)</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>Route: Chennai Koyambedu → Bangalore Majestic</div>
                      <div>Bus: Scania Multi-Axle AC Sleeper</div>
                      <div>Fare: <ValueOrPlaceholder value={null} placeholder="Fare breakdown updating" /></div>
                      <div>Driver Contact: <ValueOrPlaceholder value="" placeholder="Assigned at departure" /></div>
                    </div>
                  </div>
                  <SectionErrorWidget
                    title="Live Stop ETA Predictor unavailable"
                    onRetry={() => alert('Retrying ETA service...')}
                  />
                  <PaginationErrorIndicator onRetry={() => alert('Loading next page...')} />
                </div>
              )}

              {/* State 8: Form Validation */}
              {activeState === 'form-validation' && (
                <div className="space-y-4 text-left">
                  <FormErrorSummary errors={dummyErrors} />
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      alert('Form validated!');
                    }}
                    className="space-y-3"
                  >
                    <ValidatedField
                      id="passenger-name"
                      label="Passenger Full Name"
                      required
                      error={dummyErrors.find((e) => e.fieldId === 'passenger-name')?.message}
                      hint="As shown on Government ID"
                    >
                      <input
                        id="passenger-name"
                        type="text"
                        placeholder="e.g. Ramesh Kumar"
                        aria-invalid="true"
                        aria-describedby="passenger-name-error passenger-name-hint"
                        className="w-full rounded-xl border-2 border-red-500 bg-card px-3.5 py-2.5 text-sm text-ink outline-none"
                        value={dummyForm.name}
                        onChange={(e) => setDummyForm({ ...dummyForm, name: e.target.value })}
                      />
                    </ValidatedField>

                    <ValidatedField
                      id="passenger-phone"
                      label="Mobile Number"
                      required
                      error={dummyErrors.find((e) => e.fieldId === 'passenger-phone')?.message}
                      hint="For SMS ticket & conductor alerts"
                    >
                      <input
                        id="passenger-phone"
                        type="tel"
                        placeholder="e.g. 9876543210"
                        aria-invalid="true"
                        aria-describedby="passenger-phone-error passenger-phone-hint"
                        className="w-full rounded-xl border-2 border-red-500 bg-card px-3.5 py-2.5 text-sm text-ink outline-none"
                        value={dummyForm.phone}
                        onChange={(e) => setDummyForm({ ...dummyForm, phone: e.target.value })}
                      />
                    </ValidatedField>

                    <ValidatedField
                      id="passenger-age"
                      label="Age"
                      required
                      error={dummyErrors.find((e) => e.fieldId === 'passenger-age')?.message}
                    >
                      <input
                        id="passenger-age"
                        type="number"
                        placeholder="e.g. 28"
                        aria-invalid="true"
                        aria-describedby="passenger-age-error"
                        className="w-full rounded-xl border-2 border-red-500 bg-card px-3.5 py-2.5 text-sm text-ink outline-none"
                        value={dummyForm.age}
                        onChange={(e) => setDummyForm({ ...dummyForm, age: e.target.value })}
                      />
                    </ValidatedField>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-cream shadow-cta"
                    >
                      Validate & Submit
                    </button>
                  </form>
                </div>
              )}

              {/* State 9: Session Expired */}
              {activeState === 'session-expired' && (
                <div className="space-y-4 text-center">
                  <div className="rounded-2xl border border-ink/10 bg-surface-tint p-4 text-xs text-ink-soft">
                    Simulating the Session Expired popup dialog that triggers when an auth token expires while preserving user work:
                  </div>
                  <SessionExpiredModal
                    isOpen={true}
                    onClose={() => setActiveState('none')}
                    savedDraftSummary="Your 2 selected seats (12A, 12B) and passenger names have been safely preserved in local session."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

