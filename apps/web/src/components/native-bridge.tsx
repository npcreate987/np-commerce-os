'use client';

/**
 * NativeBridge — top-level provider ที่ทำงานเฉพาะเมื่อรันใน Capacitor shell
 *
 * หน้าที่:
 *   1) Hide splash screen หลัง React mount
 *   2) Listen deep links (Universal/App Links + URL scheme) → router.push
 *   3) Register native push token เมื่อ login state เปลี่ยน (ผ่าน prop)
 *
 * Mount ครั้งเดียวใน `(customer)/layout.tsx` (หรือ root layout)
 * Web: render null + ไม่มี side effect (lib/native.ts มี SSR guard อยู่แล้ว)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  bootstrapNative,
  hideNativeSplash,
  isNative,
  registerNativePush,
  wireDeepLinks,
} from '@/lib/native';
import { checkAndApplyLiveUpdate, notifyAppReady } from '@/lib/live-updates';
import { wireNativeLifecycle } from '@/lib/native-lifecycle';
import { ForceUpdateGate } from '@/components/force-update-gate';
import { AttConsentGate } from '@/components/att-consent-gate';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { tracker } from '@/lib/track';

interface Props {
  /** ค่า token ของ user ที่ login แล้ว (null = anonymous) */
  authToken: string | null;
}

export function NativeBridge({ authToken }: Props): JSX.Element {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  // Bootstrap + splash hide + deep links + native lifecycle + OTA — run once
  useEffect(() => {
    let cleanupDeepLinks: (() => void) | undefined;
    let cleanupLifecycle: (() => void) | undefined;
    void (async () => {
      await bootstrapNative();
      await hideNativeSplash();
      // CRITICAL: Capgo OTA watchdog rolls back if notifyAppReady() isn't
      // called within 10s of boot. Wire IMMEDIATELY after splash hides.
      void notifyAppReady();
      cleanupDeepLinks = await wireDeepLinks(async (path, fullUrl) => {
        // Phase 21.1 — LINE Login bounce-back from https://tuk-tuk.mobi.
        //
        // The web /login page finishes the LIFF flow + token exchange
        // with our API, then redirects the Custom Tab to
        // `npcommerce://login-success?token=…&userId=…&target=…&provider=line`.
        // The Android intent filter for the `npcommerce` scheme routes
        // here. We:
        //   1. Pull the access token out of the URL
        //   2. Close the system browser tab (best effort)
        //   3. Fetch the User via /users/me using that token
        //   4. Write { user, token } into the auth store
        //   5. Navigate to `target` (defaults to /feed)
        //
        // Google sign-in does NOT need this bounce — the native plugin
        // (@codetrix-studio/capacitor-google-auth) returns an id_token
        // in-process so login completes inside the WebView. This handler
        // is LINE-only by design.
        //
        // Mid-flight failure (network, /users/me 401) leaves the user on
        // /login — they can retry without losing state.
        try {
          const parsed = new URL(fullUrl);
          const isLoginCallback =
            parsed.protocol === 'npcommerce:' &&
            (parsed.host === 'login-success' || parsed.pathname.startsWith('/login-success'));
          if (isLoginCallback) {
            const token = parsed.searchParams.get('token');
            const target = parsed.searchParams.get('target') ?? '/feed';
            if (token) {
              try {
                const { Browser } = await import('@capacitor/browser');
                await Browser.close();
              } catch {
                /* user may already have dismissed the tab */
              }
              try {
                const user = await api.auth.me(token);
                setAuth({ user, token });
                void tracker.identify(user.id, token);
                router.push(target);
              } catch {
                router.push('/login');
              }
              return;
            }
          }
        } catch {
          /* malformed URL → fall through to default handler */
        }
        router.push(path);
      });
      cleanupLifecycle = await wireNativeLifecycle();
      // Background OTA check — non-blocking. Plugin handles the swap on
      // next cold-start so no UI disruption here.
      void checkAndApplyLiveUpdate().catch(() => {
        /* swallow — never block first paint */
      });
    })();
    return () => {
      cleanupDeepLinks?.();
      cleanupLifecycle?.();
    };
  }, [router, setAuth]);

  // Push registration — re-run เมื่อ token เปลี่ยน (login/logout)
  useEffect(() => {
    if (!authToken || !isNative()) return;
    void registerNativePush(authToken).catch(() => {
      /* swallow — Sentry capture happens inside helper */
    });
  }, [authToken]);

  return (
    <>
      <ForceUpdateGate />
      <AttConsentGate />
    </>
  );
}
