'use client';

/**
 * Phase 16 — Force-update gate (native only).
 *
 * Renders a full-screen blocker when the API says the current app build
 * is below `minSupported`. The user cannot bypass — only buttons are
 * "Open App Store" and "Try again" (re-fetch).
 *
 * Soft "update available" (status=UPDATE_AVAILABLE) is currently ignored
 * here — we'll surface that as a banner in Phase 16.x once we have a
 * notification inbox UI.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  getAppInfo,
  getPlatform,
  isNative,
  openExternalUrl,
} from '@/lib/native';

export function ForceUpdateGate(): JSX.Element | null {
  const [appInfo, setAppInfo] = useState<{
    version: string;
    build: string;
    platform: string;
  } | null>(null);
  const onNative = isNative();

  useEffect(() => {
    if (!onNative) return;
    void getAppInfo().then((info) => {
      if (info) {
        setAppInfo({
          version: info.appVersion,
          build: info.appBuild,
          platform: info.platform,
        });
      }
    });
  }, [onNative]);

  const versionQ = useQuery({
    queryKey: ['app-version', appInfo?.platform, appInfo?.version],
    queryFn: () =>
      api.app.version({
        platform: appInfo?.platform ?? undefined,
        version: appInfo?.version ?? undefined,
        build: appInfo?.build ?? undefined,
      }),
    enabled: onNative && !!appInfo,
    refetchInterval: 1000 * 60 * 30, // re-check every 30 min
    staleTime: 1000 * 60 * 10,
  });

  if (!onNative || !versionQ.data) return null;
  if (versionQ.data.status !== 'UPDATE_REQUIRED') return null;

  const storeUrl =
    getPlatform() === 'ios'
      ? versionQ.data.ios.storeUrl
      : versionQ.data.android.storeUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-surface px-6 text-surface-strong"
    >
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-brand-gradient text-3xl text-white shadow-glow">
          ↑
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          ต้องอัปเดตแอป
        </h1>
        <p className="mt-3 text-sm text-surface-muted">
          {versionQ.data.message.th}
        </p>
        <p className="mt-1 text-[11px] text-surface-faint">
          เวอร์ชันที่ใช้: {appInfo?.version} ({appInfo?.build}) ·
          ต้องการอย่างน้อย: {versionQ.data.minSupported}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            size="lg"
            onClick={() => void openExternalUrl(storeUrl)}
          >
            เปิด {getPlatform() === 'ios' ? 'App Store' : 'Play Store'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => versionQ.refetch()}
          >
            ลองเช็คอีกครั้ง
          </Button>
        </div>
      </div>
    </div>
  );
}
