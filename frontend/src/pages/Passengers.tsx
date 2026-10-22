import { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { genderLabel, loc } from '../utils/format';
import { LuCircleCheck, LuLock, LuMail, LuPencil, LuPhone, LuPlus, LuShieldCheck, LuUser, LuUsers } from 'react-icons/lu';
import type { Gender } from '@busgo/shared';
import { ApiError, authApi, bookingsApi, errorMessage, passengersApi, tripsApi } from '../utils/api';
import { useAuth } from '../store/auth';
import { useBooking } from '../store/booking';
import { toast } from '../store/ui';
import { Modal, Skeleton } from '../components/Overlay';
import { Countdown, Field, GenderPicker, inputCls, PageHeader } from '../components/ui';
import { FormErrorSummary } from '../components/states/FormValidationErrorState';
import { fareFor, TripSummary } from './Seats';

const schema = z.object({
  passengers: z.array(
    z.object({
      seatId: z.string(),
      gender: z.enum(['male', 'female', 'other']),
      name: z.string().min(2, 'Enter passenger name'),
      age: z.coerce.number({ invalid_type_error: 'Enter age' }).int().min(1, 'Enter age').max(120, 'Enter a valid age'),
      familyLinked: z.boolean().optional(),
    }),
  ),
  contact: z.object({ name: z.string().min(2, 'Required'), email: z.string().email('Enter a valid email'), phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number') }),
});
type Form = z.infer<typeof schema>;

const hasDetails = (p?: { name?: string; age?: unknown }) => !!p && (p.name ?? '').trim().length >= 2 && Number(p.age) >= 1;

export default function Passengers() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const b = useBooking();
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const trip = useQuery({ queryKey: ['trip', id], queryFn: () => tripsApi.detail(id) });
  const layoutQ = useQuery({ queryKey: ['seats', id], queryFn: () => tripsApi.seats(id) });
  const saved = useQuery({ queryKey: ['passengers'], queryFn: passengersApi.list });

  const seatPax = b.pax.filter((p) => p.seatId);
  // Passenger 1 is the account holder: name + age come from the profile, gender from the seat they picked.
  const isMe = (i: number) => i === 0 && seatPax[0]?.gender === user.gender;
  const f = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      passengers: seatPax.map((p, i) => ({ seatId: p.seatId!, gender: p.gender, name: isMe(i) ? user.name : '', age: (isMe(i) && user.age ? user.age : '') as unknown as number, familyLinked: false })),
      contact: { name: user.name, email: user.email, phone: user.phone },
    },
  });
  const { fields } = useFieldArray({ control: f.control, name: 'passengers' });
  const e = f.formState.errors;
  const watched = f.watch('passengers');

  // ask for the other passengers' details right away, one popup at a time
  const asked = useRef(false);
  const lastIdx = useRef<number | null>(null);
  useEffect(() => {
    if (asked.current || fields.length === 0) return;
    asked.current = true;
    const i = fields.findIndex((_, j) => !hasDetails(f.getValues(`passengers.${j}`)));
    if (i >= 0) setEditing(i);
  }, [fields, f]);

  if (!b.holdId || seatPax.length === 0) { nav(`/trip/${id}/seats`, { replace: true }); return null; }
  const ready = !!trip.data && !!layoutQ.data;
  const fare = ready ? fareFor(trip.data!, layoutQ.data!.layout, seatPax.map((p) => p.seatId!)) : undefined;
  const label = (seatId: string) => seatId.split('-').pop() ?? '';

  /**
   * Saves one passenger. Changing the gender re-validates the whole selection with the server (seat rules
   * depend on gender); if the server refuses, nothing changes and the reason is shown in the popup.
   */
  async function saveDetails(i: number, d: { name: string; age: number; familyLinked: boolean; gender: Gender }): Promise<string | null> {
    const current = f.getValues(`passengers.${i}.gender`) as Gender;
    if (d.gender !== current) {
      const nextPax = b.pax.map((p) => (p.seatId === fields[i].seatId ? { ...p, gender: d.gender } : p));
      try {
        const r = await tripsApi.hold(id, { seats: nextPax.filter((p) => p.seatId).map((p) => ({ seatId: p.seatId!, gender: p.gender, familyLinked: false })), replaceHoldId: b.holdId ?? undefined });
        b.set({ pax: nextPax, holdId: r.holdId, holdExpiresAt: r.expiresAt });
        f.setValue(`passengers.${i}.gender`, d.gender);
        toast.success(t('Seat {{seat}} is now booked for a {{gender}} passenger', { seat: label(fields[i].seatId), gender: genderLabel(d.gender) }));
      } catch (x) {
        if (x instanceof ApiError && x.code === 'NOT_ELIGIBLE') return t('Seat {{seat}} is not available for a {{gender}} passenger (seat rules). Keep the original gender or pick another seat.', { seat: label(fields[i].seatId), gender: genderLabel(d.gender) });
        if (x instanceof ApiError && x.code === 'SEAT_TAKEN') return t('That seat was just taken. Please go back and choose another seat.');
        return errorMessage(x);
      }
    }
    f.setValue(`passengers.${i}.name`, d.name, { shouldValidate: true });
    f.setValue(`passengers.${i}.age`, d.age, { shouldValidate: true });
    f.setValue(`passengers.${i}.familyLinked`, d.familyLinked);
    if (isMe(i) && !user.age) {
      try { setUser((await authApi.updateMe({ age: d.age })).user); } catch { /* the booking still carries the age */ }
    }
    // continue with the next passenger that still needs details
    const next = fields.findIndex((_, j) => j !== i && !hasDetails(f.getValues(`passengers.${j}`)));
    setEditing(next >= 0 ? next : null);
    return null;
  }

  async function submit(v: Form) {
    setErr('');
    try {
      const booking = await bookingsApi.create({ tripId: id, holdId: b.holdId!, boardingPointId: b.boardingPointId!, droppingPointId: b.droppingPointId!, passengers: v.passengers, contact: v.contact });
      nav(`/payment/${booking.id}`);
    } catch (x) { setErr(errorMessage(x)); toast.error(errorMessage(x)); }
  }

  // keep the last passenger's data on screen while the popup animates out
  if (editing !== null) lastIdx.current = editing;
  const shownIdx = editing ?? lastIdx.current;
  const shown = shownIdx !== null ? fields[shownIdx] : null;
  const shownVals = shownIdx !== null ? watched?.[shownIdx] : undefined;

  return (
    <form onSubmit={f.handleSubmit(submit)}>
      <PageHeader title={t('passengerDetails')} subtitle={t('Your details are filled in. Add the others.')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-4">
          <Countdown to={b.holdExpiresAt} label={t('holdTimer')} onExpire={() => { b.clearSelection(); nav(`/trip/${id}/seats`, { replace: true }); }} />
          {fields.map((fld, i) => {
            const w = watched?.[i];
            const done = hasDetails(w);
            const g = (w?.gender ?? fld.gender) as Gender;
            return (
              <section key={fld.id} className="rounded-2xl border-2 border-black bg-card p-4 sm:p-5 shadow-card transition-all dark:border-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-xl ${done ? 'bg-emerald-500/10 text-emerald-600' : 'bg-brand/10 text-brand'}`}>
                      {done ? <LuCircleCheck size={18} /> : isMe(i) ? <LuUser size={18} /> : <LuUsers size={18} />}
                    </span>
                    <div>
                      <p className="font-extrabold text-sm text-ink leading-tight">
                        {isMe(i) ? t('You (Primary Traveller)') : t('Passenger {{n}}', { n: i + 1 })}
                      </p>
                      <p className="text-[11px] font-semibold text-ink-soft">
                        {done ? 'Details verified' : 'Pending passenger information'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-lg border-2 border-black bg-brand px-2.5 py-1 text-xs font-black text-cream shadow-sm dark:border-white">
                      {t('Seat')} {label(fld.seatId)}
                    </span>
                    <span className="rounded-lg border-2 border-black bg-surface-tint px-2.5 py-1 text-xs font-bold capitalize text-ink dark:border-white">
                      {genderLabel(g)}
                    </span>
                  </div>
                </div>

                {done ? (
                  <div className="mt-3.5 flex items-center justify-between rounded-xl border-2 border-black bg-surface-tint/60 p-3.5 dark:border-white">
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-sm text-ink">{w.name}</p>
                      <p className="text-xs text-ink-soft capitalize mt-0.5">
                        {w.age} {t('yrs')} · {genderLabel(g)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(i)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-black bg-card px-3.5 py-1 text-xs font-bold text-ink transition hover:bg-ink hover:text-cream active:scale-95 shadow-sm dark:border-white"
                    >
                      <LuPencil size={13} />
                      {t('Edit')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(i)}
                    className="mt-3.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black bg-brand/5 py-3 text-sm font-bold text-brand transition hover:bg-brand/10 hover:border-brand active:scale-[.99] dark:border-white"
                  >
                    <LuPlus size={16} />
                    {isMe(i) ? t('Add your age') : t('Add passenger details')}
                  </button>
                )}

                <input type="hidden" {...f.register(`passengers.${i}.name`)} />
                <input type="hidden" {...f.register(`passengers.${i}.age`)} />
                {!done && (e.passengers?.[i]?.name || e.passengers?.[i]?.age) && (
                  <p role="alert" className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
                    {t('Name and age are required for this seat.')}
                  </p>
                )}
              </section>
            );
          })}

          <section className="space-y-4 rounded-2xl border-2 border-black bg-card p-4 sm:p-5 shadow-card dark:border-white">
            <div>
              <p className="font-extrabold text-base text-ink flex items-center gap-2">
                <LuMail size={18} className="text-brand" />
                {t('Contact Details')}
              </p>
              <p className="text-xs text-ink-soft mt-0.5">
                Your ticket receipt and live boarding SMS alerts will be sent here.
              </p>
            </div>

            {(() => {
              const errList = [
                e.contact?.name && { fieldId: 'contact-name', fieldLabel: t('name'), message: e.contact.name.message ?? 'Enter your name' },
                e.contact?.email && { fieldId: 'contact-email', fieldLabel: t('email'), message: e.contact.email.message ?? 'Enter a valid email' },
                e.contact?.phone && { fieldId: 'contact-phone', fieldLabel: t('phone'), message: e.contact.phone.message ?? 'Enter a valid 10-digit mobile number' },
              ].filter(Boolean) as Array<{ fieldId: string; fieldLabel: string; message: string }>;
              return <FormErrorSummary errors={errList} formLevelError={err} />;
            })()}

            <div className="space-y-3.5">
              <Field label={t('name')} error={e.contact?.name?.message}>
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3.5 text-ink-soft">
                    <LuUser size={17} />
                  </span>
                  <input
                    id="contact-name"
                    aria-invalid={!!e.contact?.name}
                    aria-describedby={e.contact?.name ? 'contact-name-error' : undefined}
                    placeholder="e.g. Ramesh Kumar"
                    className={`${inputCls} !pl-10 ${e.contact?.name ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                    {...f.register('contact.name')}
                  />
                </div>
              </Field>

              <Field label={t('email')} error={e.contact?.email?.message}>
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3.5 text-ink-soft">
                    <LuMail size={17} />
                  </span>
                  <input
                    id="contact-email"
                    type="email"
                    aria-invalid={!!e.contact?.email}
                    aria-describedby={e.contact?.email ? 'contact-email-error' : undefined}
                    placeholder="e.g. ramesh@example.com"
                    className={`${inputCls} !pl-10 ${e.contact?.email ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                    {...f.register('contact.email')}
                  />
                </div>
              </Field>

              <Field label={t('phone')} error={e.contact?.phone?.message}>
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3.5 text-ink-soft">
                    <LuPhone size={17} />
                  </span>
                  <input
                    id="contact-phone"
                    inputMode="numeric"
                    maxLength={10}
                    aria-invalid={!!e.contact?.phone}
                    aria-describedby={e.contact?.phone ? 'contact-phone-error' : undefined}
                    placeholder="10-digit mobile number"
                    className={`${inputCls} !pl-10 ${e.contact?.phone ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                    {...f.register('contact.phone')}
                  />
                </div>
              </Field>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          {ready ? <TripSummary trip={trip.data!} fare={fare} /> : <Skeleton className="h-52 !rounded-2xl" />}
          {err && <p role="alert" className="rounded-xl border-2 border-red-500 bg-red-500/10 p-3 text-sm font-semibold text-red-700">{err}</p>}
          <div className="space-y-2">
            <button
              disabled={f.formState.isSubmitting}
              className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand py-4 text-base font-extrabold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-[.99] disabled:opacity-60 dark:border-white"
            >
              {f.formState.isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t('Creating booking…')}
                </>
              ) : (
                <>
                  <LuLock size={16} />
                  {`${t('Proceed to payment')}${fare ? ` · ₹${fare.total.toLocaleString(loc())}` : ''}`}
                </>
              )}
            </button>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-ink-soft">
              <LuShieldCheck size={14} className="text-emerald-600" />
              <span>Safe & Secure 256-bit SSL encrypted checkout</span>
            </div>
          </div>
        </aside>
      </div>

      <PassengerDialog
        key={shown?.id ?? 'none'}
        open={editing !== null}
        title={shownIdx !== null && isMe(shownIdx) ? t('Your details') : t('Passenger {{n}} details', { n: (shownIdx ?? 0) + 1 })}
        seat={shown ? label(shown.seatId) : ''}
        gender={((shownVals?.gender ?? shown?.gender ?? 'male') as Gender)}
        initial={{ name: shownVals?.name ?? '', age: shownVals?.age ? String(shownVals.age) : '', familyLinked: !!shownVals?.familyLinked }}
        saved={saved.data ?? []}
        onClose={() => setEditing(null)}
        onSave={(d) => (shownIdx !== null ? saveDetails(shownIdx, d) : Promise.resolve(null))}
      />
    </form>
  );
}

/** Popup with this passenger's details: name, age, gender (re-checked against the seat rules) and family link. */
function PassengerDialog({ open, title, seat, gender, initial, saved, onClose, onSave }: {
  open: boolean; title: string; seat: string; gender: Gender;
  initial: { name: string; age: string; familyLinked: boolean };
  saved: { _id: string; name: string; age: number; gender: string; familyLinked?: boolean }[];
  onClose: () => void; onSave: (d: { name: string; age: number; familyLinked: boolean; gender: Gender }) => Promise<string | null>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [age, setAge] = useState(initial.age);
  const [g, setG] = useState<Gender>(gender);
  const [family, setFamily] = useState(initial.familyLinked);
  const [err, setErr] = useState<{ name?: string; age?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const step = (n: number) => ({ animationDelay: `${60 + n * 55}ms` });

  async function submit() {
    const e: typeof err = {};
    if (name.trim().length < 2) e.name = 'Enter the passenger name';
    const n = Number(age);
    if (!Number.isInteger(n) || n < 1 || n > 120) e.age = 'Enter a valid age';
    setErr(e);
    if (e.name || e.age) return;
    setBusy(true);
    const problem = await onSave({ name: name.trim(), age: n, familyLinked: family, gender: g });
    setBusy(false);
    if (problem) { setErr({ form: problem }); setG(gender); }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); ev.stopPropagation(); /* the popup lives inside the page form: do not submit the booking */ void submit(); }}>
        <p className="animate-fadeUp text-sm text-ink-soft" style={step(0)}>{t('Seat {{seat}}. Details of the person travelling.', { seat })}</p>
        {saved.length > 0 && (
          <div className="animate-fadeUp" style={step(1)}>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-soft">{t('Saved passengers')}</p>
            <div className="flex flex-wrap gap-2">
              {saved.map((sp) => (
                <button key={sp._id} type="button" onClick={() => { setName(sp.name); setAge(String(sp.age)); setG(sp.gender as Gender); setFamily(!!sp.familyLinked); setErr({}); }} className="rounded-full border-2 border-black/30 px-3.5 py-1.5 text-sm font-bold transition active:scale-95 hover:border-black dark:border-white/40">{sp.name}, {sp.age}</button>
              ))}
            </div>
          </div>
        )}
        <div className="grid animate-fadeUp grid-cols-[1fr_96px] gap-3" style={step(2)}>
          <Field label={t('Name')} error={err.name}><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Full name')} /></Field>
          <Field label={t('Age')} error={err.age}><input className={inputCls} inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} placeholder={t('Age')} /></Field>
        </div>
        <div className="animate-fadeUp" style={step(3)}>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-soft">{t('Gender')}</p>
          <GenderPicker value={g} onChange={(x) => { setG(x); setErr((p) => ({ ...p, form: undefined })); }} />
          {g !== gender && <p className="mt-1.5 animate-fadeUp text-xs font-semibold text-brand-700">{t('Changing gender re-checks the seat rules for this seat.')}</p>}
        </div>
        <label className="flex animate-fadeUp items-start gap-2.5 text-sm text-ink-soft" style={step(4)}><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#FF1840]" checked={family} onChange={(e) => setFamily(e.target.checked)} /><span>{t('Family member. May sit beside others in my family.')}</span></label>
        {err.form && <p role="alert" className="animate-pop rounded-2xl border-2 border-red-500 bg-red-500/10 p-3 text-sm font-semibold text-red-700">{err.form}</p>}
        <button disabled={busy} className="flex w-full animate-fadeUp items-center justify-center gap-2 rounded-xl border-2 border-black bg-brand py-4 text-base font-extrabold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-[.99] disabled:opacity-60 dark:border-white" style={step(5)}>
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{busy ? t('Checking seat rules…') : t('Save passenger')}
        </button>
      </form>
    </Modal>
  );
}
