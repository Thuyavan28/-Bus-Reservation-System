import { env } from '../config/env';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Tries each configured key in order; the next key is used when one fails (bad key, quota, 5xx, timeout). */
export interface ChatOpts {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export async function chatWithFailover(messages: ChatMsg[], fetchImpl: typeof fetch = fetch, opts: ChatOpts = {}): Promise<string> {
  const keys = [env.GROQ_API_KEY_1, env.GROQ_API_KEY_2].filter(Boolean);
  if (keys.length === 0) throw new Error('AI_NOT_CONFIGURED');
  let lastErr: unknown;
  for (const [i, key] of keys.entries()) {
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: env.GROQ_MODEL, messages, temperature: opts.temperature ?? 0.3, max_tokens: opts.maxTokens ?? 400, ...(opts.json ? { response_format: { type: 'json_object' } } : {}) }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Groq ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty AI response');
      return text.trim();
    } catch (e) {
      lastErr = e;
      console.warn(`[ai] key #${i + 1} failed: ${(e as Error).message}${i < keys.length - 1 ? ' -> trying next key' : ''}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI_FAILED');
}

export const ASSISTANT_SYSTEM_PROMPT =
  'You are BusGo South\'s support assistant for intercity buses in Tamil Nadu, Bengaluru and Kerala. ' +
  'Answer briefly in the language the user writes in (English, Tamil, Malayalam or Kannada). ' +
  'Facts: booking needs login; payment happens on an external payment website; cancelling puts a booking in "Cancellation Pending" until a replacement passenger books the seat (refund = ticket minus the operator fee, default Rs 50), ' +
  'otherwise the operator\'s fallback policy applies at the cutoff. Seats beside a male passenger are open to males; seats beside a female passenger are open to females per operator policy; people in the same booking may sit together. ' +
  'Never invent bookings, prices or refund status; tell the user to check My Trips for those.';
