'use client';

/**
 * Phase 14.2 — Shared bits for `/profile` mobile + desktop variants.
 *
 * Both `_mobile.tsx` (TikTok-style hub) and `_desktop.tsx` (LinkedIn-ish
 * 2-col) consume these helpers so the icons, tab list, formatStat math,
 * and share-link logic stay in lockstep across form factors.
 */

import { GridIcon, HeartIcon, LockIcon, StoreIcon, VideoIcon } from '@/components/icons';
import { nativeShare } from '@/lib/native';

export type TabKey = 'videos' | 'private' | 'shop' | 'liked';

export const TABS: Array<{ key: TabKey; Icon: typeof VideoIcon; label: string }> = [
  { key: 'videos',  Icon: GridIcon,  label: 'คลิป' },
  { key: 'private', Icon: LockIcon,  label: 'ที่ซ่อน' },
  { key: 'shop',    Icon: StoreIcon, label: 'ร้าน' },
  { key: 'liked',   Icon: HeartIcon, label: 'ถูกใจ' },
];

/**
 * Compact-format big numbers (1234 → "1.2K", 1_500_000 → "1.5M").
 */
export function formatStat(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

/**
 * Web-Share API with clipboard fallback. Used by both the desktop sidebar
 * "Share" button and the mobile top-bar share icon.
 */
export function shareProfile(displayName: string): void {
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const title = `โปรไฟล์ของ ${displayName} ใน NP`;
  void nativeShare({ title, url, dialogTitle: 'แชร์โปรไฟล์' });
}
