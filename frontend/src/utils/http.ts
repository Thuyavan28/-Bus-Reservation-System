import i18n from '../i18n';
function getBaseUrl(): string {
  let envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (!envUrl || envUrl === '/api') return '/api';

  // Strip trailing slashes
  envUrl = envUrl.replace(/\/+$/, '');

  if (typeof window !== 'undefined' && window.location) {
    try {
      const u = new URL(envUrl, window.location.origin);
      if (
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        return '/api';
      }
    } catch {
      // not a full URL, fallback to relative or as-is
    }
  }

  // Ensure /api is present when pointing to external server
  if (/^https?:\/\//i.test(envUrl) && !envUrl.endsWith('/api')) {
    envUrl = `${envUrl}/api`;
  }

  return envUrl;
}
const BASE = getBaseUrl();

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const j = await res.json();
      accessToken = j.accessToken;
      window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: j.user }));
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/') && (await tryRefresh())) {
    return request<T>(method, path, body, headers, false);
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    const j = await res.json().catch(() => ({}));
    throw new ApiError(res.status, j.error ?? 'ERROR', j.message ?? res.statusText, j.details);
  }
  return res.json() as Promise<T>;
}

export const http = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b?: unknown, h?: Record<string, string>) => request<T>('POST', p, b ?? {}, h),
  put: <T = any>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
  patch: <T = any>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  del: <T = any>(p: string) => request<T>('DELETE', p),
  /** Authenticated binary download (e.g. the PDF ticket). */
  async blob(p: string): Promise<Blob> {
    const go = () => fetch(`${BASE}${p}`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
    let res = await go();
    if (res.status === 401 && (await tryRefresh())) res = await go();
    if (!res.ok) throw new ApiError(res.status, 'ERROR', 'Download failed');
    return res.blob();
  },
};

/** Server messages are English; they are looked up in the active language (unknown ones are shown as-is). */
export const errorMessage = (e: unknown) => (e instanceof ApiError ? i18n.t(`err.${e.code}`, { defaultValue: i18n.t(e.message) }) : i18n.t('Something went wrong'));
