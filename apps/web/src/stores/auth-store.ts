'use client';

import type { User } from '@np/types';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { isNative, safeStorage } from '@/lib/native';

/**
 * Phase 12.2.1 — auth store with a hydration flag.
 * Phase 16 — storage now adapts to platform:
 *  - Web: window.localStorage (synchronous, instantaneous hydration)
 *  - Native (Capacitor iOS/Android): @capacitor/preferences plugin
 *    (survives iOS WKWebView 7-day ITP clear; Android backup-safe)
 *
 * Zustand's `persist` middleware loads from storage asynchronously
 * after first render. Without tracking this, every auth-gated page
 * (e.g. `/profile`, `/admin/*`, `/feed/create`) sees `token === null` on
 * the initial render and bounces the user to `/login` even when they ARE
 * logged in. We expose `hasHydrated` so pages can wait for the real value
 * before deciding to redirect.
 *
 * Usage:
 *   const token       = useAuthStore((s) => s.token);
 *   const hasHydrated = useAuthStore((s) => s._hasHydrated);
 *   if (!hasHydrated) return null;     // still loading from storage
 *   if (!token) router.replace('/login');
 */
interface AuthState {
  user: User | null;
  token: string | null;
  /** True once storage has been read (or skipped if SSR). */
  _hasHydrated: boolean;
  setAuth: (payload: { user: User; token: string }) => void;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
}

/**
 * StateStorage that hides the sync/async difference:
 * - On web, accesses localStorage synchronously through the same interface
 *   (zustand persist accepts async storage by returning Promises here too).
 * - On native, reads/writes via Capacitor Preferences plugin.
 *
 * Both branches are async-compatible — zustand will await the result.
 */
const platformStorage: StateStorage = {
  getItem: (name) => safeStorage.get(name),
  setItem: (name, value) => safeStorage.set(name, value),
  removeItem: (name) => safeStorage.remove(name),
};

/**
 * Phase 18 — push the userId into the native Sentry scope so crash
 * reports + ANR get attributed to the right account. Fires-and-forgets
 * because we never want logging to block auth.
 */
function syncSentryUser(userId: string | null): void {
  if (typeof window === 'undefined') return;
  void import('@/lib/native-observability')
    .then((m) => m.setNativeUser(userId))
    .catch(() => {
      /* noop */
    });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      _hasHydrated: false,
      setAuth: ({ user, token }) => {
        set({ user, token });
        syncSentryUser(user.id);
      },
      clear: () => {
        set({ user: null, token: null });
        syncSentryUser(null);
      },
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'np-auth',
      storage: createJSONStorage(() => platformStorage),
      // Skip persisting the flag itself — it must always start `false`.
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        // Runs after storage finishes loading (or fails). Flip the flag
        // so consumers can stop blocking. Works even when storage is empty.
        state?.setHasHydrated(true);
      },
      // Phase 16 — one-time migration: if running on native and we find
      // an existing localStorage value (e.g. user upgraded from PWA →
      // native app), copy it into Preferences. Best-effort.
      migrate: async (persistedState, _version) => {
        if (
          isNative() &&
          typeof window !== 'undefined' &&
          !persistedState
        ) {
          try {
            const legacy = window.localStorage.getItem('np-auth');
            if (legacy) {
              await safeStorage.set('np-auth', legacy);
              return JSON.parse(legacy)?.state ?? null;
            }
          } catch {
            /* noop */
          }
        }
        return persistedState as AuthState;
      },
      version: 1,
    },
  ),
);
