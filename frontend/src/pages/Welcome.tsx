import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LuArrowRight, LuBadgeCheck, LuCheck, LuGlobe, LuHeadphones, LuLock } from 'react-icons/lu';
import { LANGS, setLanguage } from '../i18n';
import { Logo } from '../components/ui';
import { HERO } from './Entry';

/** Stitch id1 "language selection" screen: hero card, language list, trust badges, orange CTA. */
export default function Welcome() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();

  const go = () => {
    try { localStorage.setItem('busgo-welcomed', '1'); } catch { /* ignore */ }
    nav('/home', { replace: true });
  };

  return (
    <div className="min-h-screen bg-app">
      <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-6 lg:max-w-xl lg:pt-12">
        <div className="mb-4 flex justify-center"><Logo /></div>

        <div className="relative overflow-hidden rounded-3xl border border-ink/10 shadow-card">
          <img src={HERO} alt={t('A BusGo bus on a coastal road')} className="h-44 w-full object-cover" />
          <span className="glass absolute bottom-3 left-3 rounded-full px-3 py-1.5 text-[11px] font-bold">{t('Connecting TN · KL · KA · AP/TG')}</span>
        </div>

        <h1 className="mt-6 text-center text-2xl font-extrabold leading-tight">{t('tagline')}</h1>
        <p className="mt-2 text-center text-sm text-ink-soft">{t('taglineSub')}</p>

        <section className="mt-5 rounded-3xl border border-ink/10 bg-card p-3.5 shadow-card" aria-labelledby="lang-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="lang-h" className="flex items-center gap-2 text-sm font-extrabold text-brand-700"><LuGlobe size={16} />{t('chooseLanguage')}</h2>
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold text-brand-700">{t('regional')}</span>
          </div>
          <div className="space-y-2" role="radiogroup">
            {LANGS.map((l, i) => {
              const on = i18n.language === l.code;
              return (
                <button key={l.code} role="radio" aria-checked={on} onClick={() => setLanguage(l.code)} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[.99] ${on ? 'border-brand bg-brand-100' : 'border-ink/10 bg-ink/5'}`}>
                  <span className={`grid h-10 w-10 place-items-center rounded-full font-extrabold ${on ? 'bg-brand text-cream' : 'bg-ink/10 text-ink-soft'}`}>{l.badge}</span>
                  <span className="flex-1">
                    <span className="block text-[15px] font-extrabold">{l.native}{i === 0 && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 align-middle text-[10px] text-cream">{t('primary')}</span>}</span>
                    <span className="block text-xs text-ink-soft">{i === 0 ? t('defaultLang') : l.label}</span>
                  </span>
                  <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${on ? 'border-brand bg-brand text-cream' : 'border-ink/25'}`}>{on && <LuCheck size={13} strokeWidth={4} />}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-3xl border border-ink/10 bg-card p-3.5 text-center">
          {[[LuBadgeCheck, t('verified'), t('verifiedSub')], [LuHeadphones, t('helpline'), t('helplineSub')], [LuLock, t('securePay'), t('securePaySub')]].map(([Icon, a, b]: any) => (
            <div key={a} className="flex flex-col items-center"><Icon size={22} className="text-brand-700" /><p className="mt-1 text-[11px] font-extrabold">{a}</p><p className="text-[10px] text-ink-soft">{b}</p></div>
          ))}
        </div>

        <button onClick={go} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-base font-extrabold text-white shadow-cta transition active:scale-[.99]">
          {t('getStarted')} <LuArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
