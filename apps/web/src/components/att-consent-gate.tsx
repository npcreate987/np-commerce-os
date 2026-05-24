'use client';

/**
 * Phase 17 — App Tracking Transparency (ATT) consent dialog.
 *
 * Apple requires apps that link user data across other companies' apps
 * or websites for tracking to show ATTrackingManager prompt. We don't
 * cross-link today, but Apple also requires apps that show our own
 * personalized ads OR sell user data to brokers to prompt.
 *
 * To stay on the safe side (and to make Phase 18 ad-supported flows easy
 * later) we surface this gate as soon as the customer reaches an
 * interactive surface. Behaviour:
 *
 *   1. On first call, check current ATT status via `getATTStatus()`.
 *   2. If `notDetermined`, show our custom "pre-prompt" sheet explaining
 *      what tracking means (Apple recommends pre-prompt to lift opt-in
 *      rate). User picks "เปิด" → trigger native dialog · "ไม่ตอนนี้" →
 *      mark as soft-decline.
 *   3. Whatever the resolved status, mirror it into the behavioural
 *      tracker (`tracker.setConsent(optedOut)`) — denied/restricted/
 *      unsupported all map to opted-out by default.
 *
 * `safeStorage` remembers the soft-decline so we don't re-pester the
 * user across sessions. The native dialog itself only fires ONCE — Apple
 * caches the user's answer and we cannot re-show.
 *
 * On non-iOS: this component is a no-op. Android tracking consent is
 * handled separately through the existing /profile/privacy toggle.
 */

import { useEffect, useState } from 'react';
import {
  getATTStatus,
  getPlatform,
  isNative,
  requestATTPermission,
  safeStorage,
  type ATTStatus,
} from '@/lib/native';
import { tracker } from '@/lib/track';
import { Button } from '@/components/ui/button';

const SOFT_DECLINE_KEY = 'np_att_soft_decline_v1';
const RESOLVED_KEY = 'np_att_resolved_v1';

export function AttConsentGate(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isNative() || getPlatform() !== 'ios') return;
    let cancelled = false;

    void (async () => {
      // Skip if previously soft-declined or already resolved this user
      const [softDecline, resolved] = await Promise.all([
        safeStorage.get(SOFT_DECLINE_KEY),
        safeStorage.get(RESOLVED_KEY),
      ]);
      if (cancelled || softDecline === '1' || resolved === '1') {
        // Sync any prior outcome into the tracker so the session honours it
        const status = await getATTStatus();
        applyToTracker(status);
        return;
      }

      const status = await getATTStatus();
      if (cancelled) return;
      if (status === 'notDetermined') {
        setOpen(true); // surface our pre-prompt
      } else {
        applyToTracker(status);
        await safeStorage.set(RESOLVED_KEY, '1');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAccept(): Promise<void> {
    setBusy(true);
    try {
      const status = await requestATTPermission();
      applyToTracker(status);
      await safeStorage.set(RESOLVED_KEY, '1');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline(): Promise<void> {
    setBusy(true);
    try {
      // User chose "ไม่ตอนนี้" — soft decline. We don't surface native
      // prompt yet (saving it for a later moment, like after first
      // purchase) but we still respect the choice in the tracker.
      tracker.setConsent(true);
      await safeStorage.set(SOFT_DECLINE_KEY, '1');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-surface p-6 text-surface-strong shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
          🛡️
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight">
          ช่วยเราเรียนรู้ความชอบของคุณ
        </h2>
        <p className="mt-2 text-sm text-surface-muted">
          NP Commerce ใช้ข้อมูลการใช้งานของคุณ (เช่น สินค้าที่คุณดู
          ค้นหา ซื้อ) เพื่อแนะนำสินค้าและเนื้อหาที่น่าจะตรงใจ
          ปิดได้ทุกเมื่อในหน้า "ความเป็นส่วนตัว"
        </p>
        <ul className="mt-3 space-y-1.5 text-[12px] text-surface-muted">
          <li className="flex gap-1.5">
            <span>•</span>
            <span>เราไม่แชร์ข้อมูลของคุณกับโฆษณาหรือบริษัทอื่น</span>
          </li>
          <li className="flex gap-1.5">
            <span>•</span>
            <span>ข้อมูลถูกใช้เฉพาะใน NP Commerce เท่านั้น</span>
          </li>
          <li className="flex gap-1.5">
            <span>•</span>
            <span>คุณดูและลบข้อมูลของคุณได้เสมอ</span>
          </li>
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <Button size="lg" loading={busy} onClick={handleAccept}>
            อนุญาต — เรียนรู้และแนะนำให้
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={handleDecline}>
            ไม่ตอนนี้
          </Button>
        </div>
        <p className="mt-3 text-center text-[10px] text-surface-faint">
          หลังกด "อนุญาต" iOS จะถามอีกครั้ง — นั่นคือป๊อปอัปของ Apple
        </p>
      </div>
    </div>
  );
}

function applyToTracker(status: ATTStatus): void {
  // Map ATT status → tracker consent. We opt-OUT by default (privacy-
  // first) when the answer is anything other than explicit `authorized`.
  // The web-side tracker stores this in localStorage so subsequent
  // sessions inherit the choice immediately.
  const allow = status === 'authorized';
  tracker.setConsent(!allow);
}
