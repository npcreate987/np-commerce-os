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

interface Props {
  /** ค่า token ของ user ที่ login แล้ว (null = anonymous) */
  authToken: string | null;
}

export function NativeBridge({ authToken }: Props): JSX.Element {
  const router = useRouter();

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
      cleanupDeepLinks = await wireDeepLinks((path) => {
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
  }, [router]);

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
