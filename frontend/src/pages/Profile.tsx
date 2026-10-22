import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LuBell, LuCheck, LuCircleUserRound, LuFlame, LuLayoutDashboard, LuLogOut, LuPlus, LuUser, LuUserRound, LuUsers } from 'react-icons/lu';
import { errorMessage, notificationsApi, passengersApi } from '../utils/api';
import { dateTime, genderLabel, noteBody } from '../utils/format';
import { useAuth } from '../store/auth';
import { toast } from '../store/ui';
import { ConfirmModal, Modal, ProfileSkeleton } from '../components/Overlay';
import { Field, GenderPicker, inputCls, PageHeader } from '../components/ui';

const schema = z.object({
  name: z.string().min(2, 'Enter name'),
  age: z.coerce.number({ invalid_type_error: 'Enter age' }).int().min(1, 'Enter age').max(120),
  gender: z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Gender is required' }) }),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  relation: z.string().optional(),
  familyLinked: z.boolean().optional(),
});
type PForm = z.infer<typeof schema>;
const GIcon = ({ g, size = 20 }: { g: string; size?: number }) => (g === 'female' ? <LuUserRound size={size} /> : g === 'male' ? <LuUser size={size} /> : <LuCircleUserRound size={size} />);

export default function Profile() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['passengers'], queryFn: passengersApi.list });
  const notes = useQuery({ queryKey: ['notifications'], queryFn: notificationsApi.list });
  const f = useForm<PForm>({ resolver: zodResolver(schema) });
  const e = f.formState.errors;

  const save = useMutation({
    mutationFn: (v: PForm) => (editing && editing !== 'new' ? passengersApi.update(editing, v as any) : passengersApi.create(v as any)),
    onSuccess: () => { toast.success(t('Passenger saved')); setEditing(null); f.reset(); qc.invalidateQueries({ queryKey: ['passengers'] }); },
    onError: (x) => toast.error(errorMessage(x)),
  });
  const del = useMutation({ mutationFn: (id: string) => passengersApi.remove(id), onSuccess: () => { toast.success(t('Passenger removed')); setDelId(null); qc.invalidateQueries({ queryKey: ['passengers'] }); }, onError: (x) => toast.error(errorMessage(x)) });

  if (!user) return null;
  if (list.isLoading) return <div><PageHeader to="/home" title={t('profile')} /><ProfileSkeleton /></div>;
  const checks = [
    ['Account', true],
    ['Phone', /^[6-9]\d{9}$/.test(user.phone)],
    ['Gender', !!user.gender],
  ] as const;
  const pct = Math.round((checks.filter(([, ok]) => ok).length / checks.length) * 100);
  const unread = notes.data?.filter((n) => !n.read).length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader to="/home" title={t('profile')} subtitle={t('Your account and saved passengers')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr] lg:items-start lg:gap-8">
      <div className="space-y-4 lg:sticky lg:top-24">

      <section className="flex items-center gap-4 rounded-3xl border-2 border-black bg-card p-5 shadow-card dark:border-white">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-brand text-3xl font-extrabold text-white ring-4 ring-ink/10">{user.name[0]?.toUpperCase()}</div>
        <div className="min-w-0"><p className="truncate text-xl font-extrabold">{user.name}</p><p className="truncate text-sm text-ink-soft">{user.email}</p><p className="text-sm text-ink-soft">+91 {user.phone}</p></div>
      </section>

      <section className="rounded-3xl border-2 border-black bg-card p-4 shadow-card dark:border-white" aria-label={t('Profile progress')}>
        <div className="mb-2.5 flex items-center justify-between text-sm font-extrabold"><span className="text-brand-700">{t('Your Progress')}</span><span className="flex items-center gap-1 text-brand-700">{t('{{pct}}% Complete', { pct })} {pct >= 60 && <LuFlame size={15} className="text-accent" />}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${pct}%` }} /></div>
        <ol className="mt-3.5 flex justify-between">
          {checks.map(([l, ok]) => (
            <li key={l} className="flex flex-1 flex-col items-center gap-1 text-[10px] font-bold">
              <span className={`grid h-7 w-7 place-items-center rounded-full border-2 ${ok ? 'border-brand bg-brand text-cream' : 'border-ink/15 text-white/20'}`}>{ok ? <LuCheck size={14} strokeWidth={4} /> : null}</span>
              <span className={ok ? 'text-brand-700' : 'text-ink-soft/60'}>{t(l)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3 rounded-3xl border-2 border-black bg-card p-4 shadow-card dark:border-white">
        <Field label={t('gender')}><GenderPicker value={user.gender} locked /></Field>
        <p className="text-xs font-semibold text-ink-soft">{t('Gender is set at signup and cannot be changed (seat eligibility depends on it).')}</p>
      </section>

      {(user.role === 'operator' || user.role === 'admin') && <button onClick={() => nav('/operator')} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-black bg-surface-tint py-3.5 text-sm font-extrabold text-ink dark:border-white"><LuLayoutDashboard size={17} />{t('Operator dashboard')}</button>}
      <button onClick={async () => { await logout(); toast.info(t('Logged out')); nav('/home'); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-black bg-card py-3.5 text-sm font-extrabold text-ink dark:border-white"><LuLogOut size={17} />{t('logout')}</button>
      </div>
      <div className="space-y-4">
      <section className="space-y-3 rounded-3xl border-2 border-black bg-card p-4 shadow-card dark:border-white">
        <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-lg font-extrabold"><LuUsers size={18} className="text-brand-700" />{t('Saved passengers')}</p><button className="flex items-center gap-1.5 rounded-full border-2 border-black bg-brand px-4 py-2 text-sm font-extrabold text-cream shadow-glow dark:border-white" onClick={() => { setEditing('new'); f.reset({ name: '', age: '' as any, gender: undefined as any, phone: '', relation: '', familyLinked: false }); }}><LuPlus size={15} />{t('Add')}</button></div>
        {!list.data?.length && <p className="text-sm text-ink-soft">{t('Add family and friends to book faster.')}</p>}
        {list.data?.map((p) => (
          <div key={p._id} className="flex items-center gap-3 rounded-2xl border-2 border-black/40 bg-ink/5 p-3 dark:border-white/40">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${p.gender === 'female' ? 'bg-seat-ladies/15 text-pink-700' : p.gender === 'male' ? 'bg-seat-booked/15 text-blue-700' : 'bg-violet-400/15 text-violet-700'}`}><GIcon g={p.gender} /></span>
            <div className="min-w-0 flex-1"><p className="flex items-center gap-2 truncate font-extrabold">{p.name} {p.familyLinked && <span className="rounded-full bg-seat-ladies/15 px-2 py-0.5 text-[10px] text-pink-700">{t('family')}</span>}</p><p className="text-xs capitalize text-ink-soft">{p.age} {t('yrs ·')} {genderLabel(p.gender)} · {p.phone}</p></div>
            <div className="flex gap-3 text-xs font-extrabold"><button className="text-brand-700" onClick={() => { setEditing(p._id); f.reset(p); }}>{t('Edit')}</button><button className="text-red-700" onClick={() => setDelId(p._id)}>{t('Delete')}</button></div>
          </div>
        ))}
      </section>

      <section className="space-y-2 rounded-3xl border-2 border-black bg-card p-4 shadow-card dark:border-white">
        <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-lg font-extrabold"><LuBell size={18} className="text-brand-700" />{t('Notifications')} {unread > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">{unread}</span>}</p><button className="text-xs font-extrabold text-brand-700" onClick={() => notificationsApi.markAllRead().then(() => notes.refetch())}>{t('Mark read')}</button></div>
        {!notes.data?.length && <p className="text-sm text-ink-soft">{t('No notifications yet.')}</p>}
        {notes.data?.slice(0, 6).map((n) => <div key={n._id} className={`rounded-2xl p-3 text-sm ${n.read ? 'bg-ink/5' : 'border border-brand/30 bg-brand-50'}`}><p className="font-extrabold">{t(n.title)}</p><p className="text-xs text-ink-soft">{noteBody(n.body)} · {dateTime(n.createdAt)}</p></div>)}
      </section>
      </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('Add passenger') : t('Edit passenger')}>
        <form className="space-y-3" onSubmit={f.handleSubmit((v) => save.mutate(v))}>
          <Field label={t('name')} error={e.name?.message}><input className={inputCls} {...f.register('name')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('age')} error={e.age?.message}><input className={inputCls} inputMode="numeric" {...f.register('age')} /></Field>
            <Field label={`${t('phone')} *`} error={e.phone?.message}><input className={inputCls} inputMode="numeric" maxLength={10} {...f.register('phone')} /></Field>
          </div>
          <Field label={`${t('gender')} *`} error={e.gender?.message}><GenderPicker value={f.watch('gender')} onChange={(g) => f.setValue('gender', g, { shouldValidate: true })} /></Field>
          <Field label={t('Relation (optional)')}><input className={inputCls} {...f.register('relation')} /></Field>
          <label className="flex items-start gap-2.5 text-sm text-ink-soft"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#E5123A]" {...f.register('familyLinked')} /> {t('Link as family. May sit beside my other family passengers.')}</label>
          <button disabled={save.isPending} className="w-full rounded-2xl bg-brand py-3.5 font-extrabold text-cream disabled:opacity-60">{save.isPending ? t('Saving…') : t('Save passenger')}</button>
        </form>
      </Modal>
      <ConfirmModal open={!!delId} title={t('Remove passenger?')} text={t('This passenger will be removed from your saved list.')} confirmLabel={t('Remove')} tone="danger" busy={del.isPending} onConfirm={() => delId && del.mutate(delId)} onClose={() => setDelId(null)} />
    </div>
  );
}
