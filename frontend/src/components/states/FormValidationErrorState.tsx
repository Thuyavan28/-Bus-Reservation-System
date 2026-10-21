import type { ReactNode } from 'react';
import { LuCircleAlert, LuArrowRight, LuCheck, LuInfo } from 'react-icons/lu';

export interface FormErrorItem {
  fieldId: string;
  fieldLabel: string;
  message: string;
}

export interface FormErrorSummaryProps {
  errors: FormErrorItem[];
  formLevelError?: ReactNode;
  onJumpToField?: (fieldId: string) => void;
  className?: string;
}

/** Error summary banner at the top of forms with accessible anchor links jumping to invalid fields */
export function FormErrorSummary({
  errors,
  formLevelError,
  onJumpToField,
  className = '',
}: FormErrorSummaryProps) {
  if (errors.length === 0 && !formLevelError) return null;

  const handleClick = (fieldId: string) => {
    if (onJumpToField) {
      onJumpToField(fieldId);
      return;
    }
    const el = document.getElementById(fieldId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  return (
    <div
      role="alert"
      aria-labelledby="form-error-summary-title"
      tabIndex={-1}
      className={`mb-6 rounded-2xl border border-red-300 bg-red-50/80 p-4 text-left shadow-sm dark:border-red-900/60 dark:bg-red-950/30 ${className}`}
    >
      <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
        <LuCircleAlert size={18} className="shrink-0" />
        <h4 id="form-error-summary-title" className="text-sm font-bold">
          {errors.length > 0
            ? `Please correct the following ${errors.length} issue${errors.length > 1 ? 's' : ''}:`
            : 'Form submission error'}
        </h4>
      </div>

      {formLevelError && (
        <div className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">
          {formLevelError}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="mt-2.5 list-disc space-y-1.5 pl-6 text-xs font-medium text-red-800 dark:text-red-300">
          {errors.map((err) => (
            <li key={err.fieldId}>
              <button
                type="button"
                onClick={() => handleClick(err.fieldId)}
                className="text-left underline hover:text-red-950 focus-visible:outline-red-600 dark:hover:text-red-100"
              >
                <span className="font-bold">{err.fieldLabel}:</span> {err.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Field wrapper with plain-language inline error, required/optional indicators, and aria wiring */
export function ValidatedField({
  id,
  label,
  required = false,
  error,
  hint,
  children,
  className = '',
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-bold uppercase tracking-wide text-ink">
          {label}{' '}
          {required ? (
            <span className="text-red-600 font-extrabold" title="Required field">
              *
            </span>
          ) : (
            <span className="font-normal normal-case text-ink-soft text-[11px]">(Optional)</span>
          )}
        </label>
        {hint && (
          <span id={hintId} className="text-[11px] text-ink-soft">
            {hint}
          </span>
        )}
      </div>

      <div className="relative">
        {children}
      </div>

      {/* Accessible inline error: icon + text + color */}
      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400"
        >
          <LuCircleAlert size={14} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
