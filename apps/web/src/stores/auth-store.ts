'use client';

import type { User } from '@np/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Phase 12.2.1 — auth store with a hydration flag.
 *
 * Zustand's `persist` middleware loads from `localStorage` asynchronously
 * after first render. Without tracking this, every auth-gated page
 * (e.g. `/profile`, `/admin/*`, `/feed/create`) sees `token === null` on
 * the initial render and bounces the user to `/login` even when they ARE
 * logged in. We expose `hasHydrated` so pages can wait for the real value
 * before deciding to redirect.
 *
 * Usage:
 *   const token       = useAuthStore((s) => s.token);
 *   const hasHydrated = useAuthStore((s) => s._hasHydrated);
 *   if (!hasHydrated) return null;     // still loading from localStorage
 *   if (!token) router.replace('/login');
 */
interface AuthState {
  user: User | null;
  token: string | null;
  /** True once localStorage has been read (or skipped if SSR). */
  _hasHydrated: boolean;
  setAuth: (payload: { user: User; token: string }) => void;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      _hasHydrated: false,
      setAuth: ({ user, token }) => set({ user, token }),
      clear: () => set({ user: null, token: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'np-auth',
      // Skip persisting the flag itself — it must always start `false`.
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        // Runs after localStorage finishes loading (or fails). Flip the flag
        // so consumers can stop blocking. Works even when storage is empty.
        state?.setHasHydrated(true);
      },
    },
  ),
);
