import type { Gender } from '@busgo/shared';
import { http } from '../http';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  role: 'user' | 'operator' | 'admin';
  operatorId?: string;
  language: string;
  /** null for accounts created before age was collected */
  age: number | null;
}
export interface Session {
  user: User;
  accessToken: string;
}
export interface SignupBody {
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  age: number;
  password: string;
}

/** /api/auth/* */
export const authApi = {
  signup: (b: SignupBody) => http.post<Session>('/auth/signup', b),
  login: (b: { email: string; password: string }) => http.post<Session>('/auth/login', b),
  /** emails a single-use reset link (dev mode also returns it as devLink) */
  forgot: (email: string) => http.post<{ sent: boolean; devLink?: string }>('/auth/forgot', { email }),
  reset: (token: string, password: string) => http.post<{ ok: boolean }>('/auth/reset', { token, password }),
  refresh: () => http.post<Session>('/auth/refresh'),
  logout: () => http.post('/auth/logout'),
  me: () => http.get<{ user: User }>('/auth/me'),
  updateMe: (b: Partial<{ name: string; phone: string; gender: Gender; age: number; language: string }>) => http.patch<{ user: User }>('/auth/me', b),
};
