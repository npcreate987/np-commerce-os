'use client';

/**
 * NativeBridge — auth-aware native bridge for push token registration only
 *
 * หลังจาก Phase 19.2 ส่วน boot/OTA/lifecycle/gates ย้ายไป `OtaBridge` ที่ mount
 * ที่ root layout (ทุก route). NativeBridge เหลือแค่หน้าที่เดียว คือ register
 * push token เมื่อ user login. ต้องอยู่ใน shell ที่รู้จัก auth state
 * (CustomerShell etc.)
 */

import { useEffect } from 'react';
import { isNative, registerNativePush } from '@/lib/native';

interface Props {
  /** ค่า token ของ user ที่ login แล้ว (null = anonymous) */
  authToken: string | null;
}

export function NativeBridge({ authToken }: Props): JSX.Element | null {
  useEffect(() => {
    if (!authToken || !isNative()) return;
    void registerNativePush(authToken).catch(() => {
      /* swallow — Sentry capture happens inside helper */
    });
  }, [authToken]);

  return null;
}
