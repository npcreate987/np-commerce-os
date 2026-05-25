'use client';

/**
 * OtaBridge — auth-independent native bootstrap bridge.
 *
 * เดิม `NativeBridge` ทำทั้ง boot/OTA + push registration รวมกัน แต่ mount
 * เฉพาะ `(customer)/*` routes เท่านั้น ทำให้หน้า landing/admin/merchant
 * ไม่ได้เรียก checkAndApplyLiveUpdate() เลย → OTA loop ไม่ทำงาน
 *
 * แก้โดยแยก:
 *   - **OtaBridge** (ไฟล์นี้) — boot + splash + OTA + lifecycle + deep links +
 *     ForceUpdateGate + AttConsentGate → mount ที่ root layout (every page)
 *   - **NativeBridge** — เหลือแค่ push token registration → mount ใน
 *     CustomerShell (ต้องการ authToken)
 *
 * Lifecycle (ครั้งเดียวต่อ app session):
 *   1. bootstrapNative()      — pre-flight Capacitor APIs check
 *   2. hideNativeSplash()     — fade splash หลัง React mount
 *   3. notifyAppReady()       — บอก Capgo ว่า app boot สำเร็จ (≤10s watchdog)
 *   4. wireDeepLinks(router)  — handle Universal/App Links + URL scheme
 *   5. wireNativeLifecycle()  — pause/resume → Sentry breadcrumb + replay
 *   6. checkAndApplyLiveUpdate() — background OTA check (non-blocking)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  bootstrapNative,
  hideNativeSplash,
  wireDeepLinks,
} from '@/lib/native';
import { checkAndApplyLiveUpdate, notifyAppReady } from '@/lib/live-updates';
import { wireNativeLifecycle } from '@/lib/native-lifecycle';
import { ForceUpdateGate } from '@/components/force-update-gate';
import { AttConsentGate } from '@/components/att-consent-gate';

export function OtaBridge(): JSX.Element {
  const router = useRouter();

  useEffect(() => {
    let cleanupDeepLinks: (() => void) | undefined;
    let cleanupLifecycle: (() => void) | undefined;
    void (async () => {
      await bootstrapNative();
      await hideNativeSplash();
      void notifyAppReady();
      cleanupDeepLinks = await wireDeepLinks((path) => {
        router.push(path);
      });
      cleanupLifecycle = await wireNativeLifecycle();
      void checkAndApplyLiveUpdate().catch(() => {
        /* swallow — never block first paint */
      });
    })();
    return () => {
      cleanupDeepLinks?.();
      cleanupLifecycle?.();
    };
  }, [router]);

  return (
    <>
      <ForceUpdateGate />
      <AttConsentGate />
    </>
  );
}
