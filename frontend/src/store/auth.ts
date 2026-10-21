import { create } from 'zustand';
import { authApi, setAccessToken, type User } from '../utils/api';

export type { User };

interface AuthState {
  user: User | null;
  ready: boolean;
  init: () => Promise<void>;
  setSession: (user: User, token: string) => void;
  setUser: (u: User) => void;
  logout: () => Promise<void>;
}

// Refresh tokens rotate, so session restore must run exactly once even if several callers ask.
let initPromise: Promise<void> | null = null;

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  init() {
    initPromise ??= (async () => {
      try {
        const r = await authApi.refresh();
        setAccessToken(r.accessToken);
        set({ user: r.user, ready: true });
      } catch {
        set({ user: null, ready: true });
      }
    })();
    return initPromise;
  },
  setSession(user, token) {
    setAccessToken(token);
    set({ user, ready: true });
  },
  setUser: (user) => set({ user }),
  async logout() {
    await authApi.logout().catch(() => undefined);
    setAccessToken(null);
    set({ user: null });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('auth:refreshed', (e) => useAuth.setState({ user: (e as CustomEvent).detail }));
}
