import { forwardRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { LuArrowRight, LuBus, LuCheck, LuChevronLeft, LuCircleUserRound, LuFlame, LuLock, LuMail, LuPartyPopper, LuPhone, LuUser, LuUserRound } from 'react-icons/lu';
import { ApiError, authApi, errorMessage, type Session } from '../utils/api';
import { useAuth } from '../store/auth';
import { toast } from '../store/ui';
import { Logo } from '../components/ui';

const phoneRx = /^[6-9]\d{9}$/;

function useAfterAuth() {
  const nav = useNavigate();
  const loc = useLocation();
  const set = useAuth((s) => s.setSession);
  return (r: Session, welcome?: string) => {
    set(r.user, r.accessToken);
    toast.success(welcome ?? i18n.t('Welcome back, {{name}}!', { name: r.user.name.split(' ')[0] }));
    nav((loc.state as any)?.from ?? '/home', { replace: true });
  };
}

/** Shared by login + signup. Web: pink brand panel beside the form. Phone: just the form. */
function Frame({ title, subtitle, back, children, label }: { title: ReactNode; subtitle: string; back?: () => void; children: ReactNode; label: string }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-app lg:grid lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="hidden flex-col justify-between bg-brand p-12 text-cream lg:flex">
        <Link to="/home" className="flex items-center gap-3 text-2xl font-extrabold"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand"><LuBus size={24} /></span>BusGo <span className="text-white/70 ml-1">South</span></Link>
        <div>
          <h2 className="max-w-md text-5xl font-extrabold leading-[1.05]">{t('Book your next South India journey in seconds.')}</h2>
          <ul className="mt-8 space-y-3 text-lg font-semibold">
            {['Real distance, time and arrival on every bus', 'Seats arranged with your safety in mind', 'E-ticket with barcode on screen and email'].map((x) => <li key={x} className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-brand"><LuCheck size={15} strokeWidth={4} /></span>{t(x)}</li>)}
          </ul>
        </div>
        <p className="text-sm font-semibold text-cream/80">{t('Tamil Nadu · Karnataka · Kerala')}</p>
      </aside>
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 pb-12 pt-5 lg:min-h-0 lg:max-w-none lg:items-center lg:justify-center lg:px-12">
        <div className="w-full lg:max-w-md">
          <div className="mb-5 flex items-center justify-between">
            <button onClick={back ?? (() => nav(-1))} aria-label={t('Back')} className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-card transition hover:bg-ink hover:text-cream active:scale-90"><LuChevronLeft size={20} /></button>
            <span className="text-sm font-extrabold text-ink-soft">{label}</span><span className="lg:hidden"><Logo compact /></span><span className="hidden w-10 lg:block" />
          </div>
          <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm font-medium text-ink-soft">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ step, steps }: { step: number; steps: string[] }) {
  const { t } = useTranslation();
  const pct = Math.round((step / steps.length) * 100);
  return (
    <div className="rounded-3xl border-2 border-black bg-card p-4 shadow-card dark:border-white" aria-label={`${t('Progress')} ${pct}%`}>
      <div className="mb-2.5 flex items-center justify-between text-sm font-extrabold"><span className="text-brand-700">{t('Your Progress')}</span><span className="flex items-center gap-1 text-brand-700">{t('{{pct}}% Complete', { pct })} {pct >= 50 && <LuFlame size={15} className="text-accent" />}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      <ol className="mt-3.5 flex justify-between">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center gap-1.5 text-[11px] font-bold">
            <span className={`grid h-7 w-7 place-items-center rounded-full border-2 text-xs transition ${i < step ? 'border-brand bg-brand text-cream' : i === step ? 'border-brand text-brand-700 ring-4 ring-brand/15' : 'border-ink/15 text-white/25'}`}>{i < step ? <LuCheck size={14} strokeWidth={4} /> : i + 1}</span>
            <span className={i <= step ? 'text-brand-700' : 'text-ink-soft/60'}>{t(s)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => <span className="mb-1.5 block text-sm font-extrabold">{children}</span>;
const Err = ({ children }: { children?: ReactNode }) => (children ? <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{typeof children === 'string' ? i18n.t(children) : children}</p> : null);
const Input = forwardRef<HTMLInputElement, { icon: ReactNode; error?: boolean } & React.InputHTMLAttributes<HTMLInputElement>>(({ icon, error, ...p }, ref) => (
  <div className={`flex items-center gap-3 rounded-2xl border-2 bg-white px-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition focus-within:ring-4 dark:bg-zinc-900 ${error ? 'border-red-600 focus-within:border-red-600 focus-within:ring-red-500/20' : 'border-black focus-within:border-brand focus-within:ring-brand/15 dark:border-white'}`}><span className="text-ink-soft">{icon}</span><input ref={ref} {...p} className="w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-ink-soft/60" /></div>
));
Input.displayName = 'Input';
const Cta = ({ children, disabled, dark }: { children: ReactNode; disabled?: boolean; dark?: boolean }) => (
  <button disabled={disabled} className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-black py-4 text-base font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition hover:translate-x-[1px] hover:translate-y-[1px] active:scale-[.99] disabled:opacity-60 dark:border-white ${dark ? 'bg-zinc-800 text-white' : 'bg-brand text-white'}`}>
    {disabled && <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/40 border-t-white" />}{children}
  </button>
);

/* ---------------- login ---------------- */
const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });

export function Login() {
  const { t } = useTranslation();
  const done = useAfterAuth();
  const loc = useLocation();
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const needLogin = !!(loc.state as any)?.from && (loc.state as any).from !== '/home';

  return (
    <Frame title={t('Welcome back')} subtitle={needLogin ? t('Log in to view seats and book your trip.') : t('Log in to book and manage your trips.')} label={t('Log in')}>
      <form
        onSubmit={f.handleSubmit(async (v) => {
          try {
            done(await authApi.login(v));
          } catch (e: any) {
            const code = e?.code;
            if (code === 'ACCOUNT_NOT_FOUND') {
              const msg = t('Account unavailable. Please check your email or create an account first.');
              f.setError('email', { message: msg });
              toast.error(msg);
            } else if (code === 'INCORRECT_PASSWORD') {
              const msg = t('Incorrect password. Please check your password.');
              f.setError('password', { message: msg });
              toast.error(msg);
            } else {
              toast.error(errorMessage(e));
            }
          }
        })}
        className="space-y-3.5"
      >
        <label className="block">
          <Label>{t('email')}</Label>
          <Input icon={<LuMail size={17} />} error={!!f.formState.errors.email} type="email" autoComplete="email" placeholder={t('you@email.com')} {...f.register('email')} />
          <Err>{f.formState.errors.email?.message}</Err>
        </label>
        <label className="block">
          <Label>{t('password')}</Label>
          <Input icon={<LuLock size={17} />} error={!!f.formState.errors.password} type="password" autoComplete="current-password" placeholder={t('Your password')} {...f.register('password')} />
          <Err>{f.formState.errors.password?.message}</Err>
        </label>
        <div className="text-right"><Link to="/forgot-password" state={{ email: f.watch('email') }} className="text-sm font-extrabold text-brand-700">{t('Forgot password?')}</Link></div>
        <Cta disabled={f.formState.isSubmitting}>{t('login')} <LuArrowRight size={18} /></Cta>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">{t('New here?')} <Link className="font-extrabold text-brand-700" to="/signup" state={loc.state}>{t('Create an account')}</Link></p>
    </Frame>
  );
}

/* ---------------- forgot / reset password ---------------- */
export function ForgotPassword() {
  const { t } = useTranslation();
  const loc = useLocation();
  const [email, setEmail] = useState(((loc.state as any)?.email as string) ?? '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const valid = z.string().email().safeParse(email).success;

  async function submit() {
    setBusy(true);
    try { setSent(await authApi.forgot(email.trim())); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Frame title={t('Forgot password?')} subtitle={t('Enter your account email and we will send you a link to choose a new password.')} label={t('Reset password')}>
      {sent ? (
        <div className="animate-fadeUp space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border-2 border-ink/10 bg-card p-4 text-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-cream"><LuMail size={18} /></span><p><b>{t('Check your email.')}</b> {t('If an account exists for {{email}}, a reset link is on its way. It works once and expires in 30 minutes.', { email })}</p></div>
          {sent.devLink && <p className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-900">{t('Development mode (no email service configured):')} <Link className="break-all font-extrabold underline" to={new URL(sent.devLink).pathname}>{t('open the reset link')}</Link></p>}
          <button onClick={() => setSent(null)} className="w-full rounded-2xl border-2 border-ink/15 py-3.5 text-sm font-extrabold">{t('Use a different email')}</button>
        </div>
      ) : (
        <form onSubmit={(ev) => { ev.preventDefault(); if (valid) void submit(); }} className="space-y-3.5">
          <label className="block"><Label>{t('Email Address')}</Label><Input autoFocus icon={<LuMail size={17} />} type="email" autoComplete="email" placeholder={t('you@email.com')} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <Cta disabled={busy || !valid}>{t('Send reset link')} <LuArrowRight size={18} /></Cta>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-ink-soft">{t('Remembered it?')} <Link className="font-extrabold text-brand-700" to="/login">{t('Log in')}</Link></p>
    </Frame>
  );
}

const resetSchema = z.object({ password: z.string().min(8, 'At least 8 characters'), confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function ResetPassword() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [ok, setOk] = useState(false);
  const f = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  const e = f.formState.errors;

  return (
    <Frame title={ok ? t('Password changed') : t('Choose a new password')} subtitle={ok ? t('You can now log in with your new password.') : t('Pick something at least 8 characters long.')} label={t('Reset password')} back={() => nav('/login')}>
      {ok ? (
        <div className="animate-fadeUp space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-ink/10 bg-card p-4 text-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-cream"><LuCheck size={18} strokeWidth={4} /></span><p>{t('Your password was updated and all other devices were signed out.')}</p></div>
          <button onClick={() => nav('/login', { replace: true })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-extrabold text-cream shadow-cta">{t('Go to log in')} <LuArrowRight size={18} /></button>
        </div>
      ) : (
        <form onSubmit={f.handleSubmit(async (v) => { try { await authApi.reset(token, v.password); setOk(true); } catch (x) { toast.error(errorMessage(x)); } })} className="space-y-3.5">
          <label className="block"><Label>{t('New password')}</Label><Input autoFocus icon={<LuLock size={17} />} type="password" autoComplete="new-password" placeholder={t('At least 8 characters')} {...f.register('password')} /><Err>{e.password?.message}</Err></label>
          <label className="block"><Label>{t('Confirm password')}</Label><Input icon={<LuLock size={17} />} type="password" autoComplete="new-password" placeholder={t('Type it again')} {...f.register('confirm')} /><Err>{e.confirm?.message}</Err></label>
          <Cta disabled={f.formState.isSubmitting}>{t('Update password')} <LuArrowRight size={18} /></Cta>
        </form>
      )}
      {!ok && <p className="mt-6 text-center text-sm text-ink-soft">{t('Link expired?')} <Link className="font-extrabold text-brand-700" to="/forgot-password">{t('Request a new one')}</Link></p>}
    </Frame>
  );
}

/* ---------------- signup (4 steps) ---------------- */
const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  name: z.string().min(2, 'Enter your full name'),
  phone: z.string().regex(phoneRx, 'Enter a valid 10-digit mobile number'),
  age: z.coerce.number({ invalid_type_error: 'Enter your age' }).int('Enter a valid age').min(1, 'Enter your age').max(120, 'Enter a valid age'),
  gender: z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Please choose your gender' }) }),
});
type SignupForm = z.infer<typeof schema>;
const STEPS = ['Sign up', 'Profile', 'Gender', 'Done'];
const COPY = [
  ["Let's get started", 'Create your account to book seats.'],
  ["You're doing great!", 'Just a few more details to complete your profile.'],
  ['Almost there!', 'Seat eligibility depends on gender, so this is required.'],
  ['All set?', 'Check your details and create your account.'],
];

export function Signup() {
  const { t } = useTranslation();
  const done = useAfterAuth();
  const loc = useLocation();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const f = useForm<SignupForm>({ resolver: zodResolver(schema), mode: 'onTouched' });
  const e = f.formState.errors;
  const v = f.watch();
  const fields: (keyof SignupForm)[][] = [['email', 'password'], ['name', 'phone', 'age'], ['gender'], []];

  async function next() {
    if (!(await f.trigger(fields[step]))) return;
    if (step < 3) return setStep(step + 1);
    setBusy(true);
    try {
      const vals = f.getValues();
      const r = await authApi.signup({ ...vals, age: Number(vals.age) });
      done(r, i18n.t('Account created. Welcome, {{name}}!', { name: r.user.name.split(' ')[0] }));
    } catch (x) {
      toast.error(errorMessage(x));
      // Go back to step 0 (email/phone) only for account-already-exists conflicts so the
      // user can correct their email or phone. For any other error keep the review visible.
      if (x instanceof ApiError && x.code === 'ACCOUNT_EXISTS') setStep(0);
    } finally { setBusy(false); }
  }

  return (
    <Frame title={t(COPY[step][0])} subtitle={t(COPY[step][1])} label={t('Profile Setup')} back={step ? () => setStep(step - 1) : undefined}>
      <ProgressCard step={step} steps={STEPS} />
      <form className="mt-6" onSubmit={(ev) => { ev.preventDefault(); void next(); }} noValidate>
        {step === 0 && (
          <div key="s0" className="animate-fadeUp space-y-3.5">
            <label className="block"><Label>{t('Email Address')}</Label><Input autoFocus icon={<LuMail size={17} />} type="email" autoComplete="email" placeholder={t('your@email.com')} {...f.register('email')} /><Err>{e.email?.message}</Err></label>
            <label className="block"><Label>{t('Password')}</Label><Input icon={<LuLock size={17} />} type="password" autoComplete="new-password" placeholder={t('At least 8 characters')} {...f.register('password')} /><Err>{e.password?.message}</Err></label>
          </div>
        )}
        {step === 1 && (
          <div key="s1" className="animate-fadeUp space-y-3.5">
            <label className="block"><Label>{t('Full Name')}</Label><Input autoFocus icon={<LuUser size={17} />} autoComplete="name" placeholder={t('Enter your name')} {...f.register('name')} /><Err>{e.name?.message}</Err></label>
            <label className="block"><Label>{t('Phone Number')}</Label><Input icon={<LuPhone size={17} />} inputMode="numeric" maxLength={10} autoComplete="tel" placeholder={t('10-digit mobile number')} {...f.register('phone')} /><Err>{e.phone?.message}</Err></label>
            <label className="block"><Label>{t('Age')}</Label><Input icon={<LuUser size={17} />} inputMode="numeric" maxLength={3} placeholder={t('Your age')} {...f.register('age')} /><Err>{e.age?.message}</Err></label>
          </div>
        )}
        {step === 2 && (
          <div key="s2" className="animate-fadeUp">
            <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={t('Gender')}>
              {([['male', LuUser, 'Male'], ['female', LuUserRound, 'Female'], ['other', LuCircleUserRound, 'Other']] as const).map(([g, Icon, l]) => (
                <button key={g} type="button" role="radio" aria-checked={v.gender === g} onClick={() => f.setValue('gender', g, { shouldValidate: true })}
                  className={`flex flex-col items-center gap-2 rounded-3xl border-2 p-4 transition active:scale-95 ${v.gender === g ? 'border-brand bg-brand-100 text-brand-700 shadow-glow' : 'border-ink/10 bg-ink/5 text-ink-soft'}`}>
                  <Icon size={30} /><span className="text-sm font-extrabold">{l}</span>
                </button>
              ))}
            </div>
            <Err>{e.gender?.message}</Err>
          </div>
        )}
        {step === 3 && (
          <dl key="s3" className="animate-fadeUp divide-y divide-ink/10 rounded-3xl border border-ink/10 bg-card px-4 text-sm">
            {([['Email', v.email], ['Name', v.name], ['Phone', v.phone], ['Age', v.age], ['Gender', v.gender]] as const).map(([k, x]) => <div key={k} className="flex justify-between py-3.5"><dt className="font-semibold text-ink-soft">{t(k)}</dt><dd className="font-extrabold">{k === 'Gender' ? t(({ male: 'Male', female: 'Female', other: 'Other' } as Record<string, string>)[String(x)] ?? String(x)) : x}</dd></div>)}
          </dl>
        )}
        <Cta disabled={busy} dark={step === 0}>{step === 3 ? <>{t('Create account')} <LuPartyPopper size={18} /></> : <>{t('Continue')} <LuArrowRight size={18} /></>}</Cta>
      </form>
      <p className="mt-5 text-center text-sm text-ink-soft">{t('Have an account?')} <Link className="font-extrabold text-brand-700" to="/login" state={loc.state}>{t('Log in')}</Link></p>
    </Frame>
  );
}
