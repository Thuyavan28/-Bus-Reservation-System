import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { LuMessageCircle, LuSend, LuX } from 'react-icons/lu';
import { assistantApi } from '../utils/api';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

/** Support chat. The AI keys live on the server (with automatic failover); the browser never sees them. */
export default function Assistant() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setText('');
    setBusy(true);
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    try {
      const r = await assistantApi.ask(message, history);
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: i18n.t('Sorry, the assistant is unavailable right now.') }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="fixed bottom-24 right-4 z-30 grid h-14 w-14 place-items-center rounded-full border-2 border-ink bg-brand text-cream shadow-cta transition hover:scale-105 active:scale-90 lg:bottom-8 lg:right-[max(1.5rem,calc((100vw-72rem)/2+2rem))]" aria-label={t('askAssistant')}>
        {open ? <LuX size={22} /> : <LuMessageCircle size={22} />}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex animate-fade items-end justify-end bg-ink/40 lg:items-end lg:bg-transparent lg:p-8 lg:pb-28" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="flex h-[72vh] w-full animate-sheet flex-col rounded-t-[2rem] border-2 border-b-0 border-ink bg-surface-tint shadow-lift lg:h-[32rem] lg:max-w-sm lg:animate-pop lg:rounded-[2rem] lg:border-b-2">
            <div className="flex items-center justify-between px-5 py-4"><p className="font-extrabold">{t('askAssistant')}</p><button onClick={() => setOpen(false)} aria-label={t('Close')} className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-card"><LuX size={16} /></button></div>
            <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-2 text-sm">
              {msgs.length === 0 && <p className="text-ink-soft">{t('Ask about booking, seats, cancellation or refunds.')}</p>}
              {msgs.map((m, i) => <div key={i} className={`max-w-[85%] animate-pop rounded-2xl px-3.5 py-2.5 ${m.role === 'user' ? 'ml-auto bg-brand text-cream' : 'border border-ink/10 bg-card'}`}>{m.content}</div>)}
              {busy && <div className="flex gap-1.5 px-2 py-3">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 animate-hop rounded-full bg-brand" style={{ animationDelay: `${i * 140}ms` }} />)}</div>}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t-2 border-ink p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} className="flex-1 rounded-2xl border-2 border-ink/15 bg-card px-4 py-3 text-sm outline-none focus:border-brand" placeholder={t('Type a message')} />
              <button disabled={busy} aria-label={t('Send')} className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-cream transition active:scale-90 disabled:opacity-60"><LuSend size={18} /></button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
