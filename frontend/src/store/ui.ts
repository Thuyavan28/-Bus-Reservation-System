import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface UIState {
  toasts: ToastItem[];
  push: (kind: ToastKind, text: string) => void;
  dismiss: (id: number) => void;
}

let n = 0;
export const useUI = create<UIState>((set, get) => ({
  toasts: [],
  push(kind, text) {
    const id = ++n;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 5000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Fire-and-forget popups: toast.success('Saved'), toast.error('...') */
export const toast = {
  success: (t: string) => useUI.getState().push('success', t),
  error: (t: string) => useUI.getState().push('error', t),
  info: (t: string) => useUI.getState().push('info', t),
};
