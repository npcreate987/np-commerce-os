'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  isPushSupported,
  notificationPermission,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from '@/lib/push';
import {
  getPushPermission,
  isNative,
  registerNativePush,
} from '@/lib/native';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import type { NotificationChannel } from '@np/types';

interface ChannelRow {
  channel: NotificationChannel;
  label: string;
  description: string;
  enabled: boolean;
  badge?: string;
}

export default function NotificationsSettingsPage(): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [pushBusy, setPushBusy] = useState(false);
  const [nativePushBusy, setNativePushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [nativeResult, setNativeResult] = useState<string | null>(null);
  const [nativePerm, setNativePerm] = useState<
    'granted' | 'denied' | 'prompt' | 'unsupported'
  >('unsupported');
  const onNative = isNative();

  useEffect(() => {
    if (!onNative) return;
    void getPushPermission().then(setNativePerm);
  }, [onNative]);

  const configQ = useQuery({
    queryKey: ['notif-config'],
    queryFn: () => api.notifications.config(),
  });
  const prefsQ = useQuery({
    queryKey: ['notif-prefs'],
    queryFn: () => api.notifications.prefs.list(token!),
    enabled: !!token,
  });
  const pushSubsQ = useQuery({
    queryKey: ['notif-push'],
    queryFn: () => api.notifications.push.list(token!),
    enabled: !!token,
  });
  const lineQ = useQuery({
    queryKey: ['notif-line'],
    queryFn: () => api.notifications.line.me(token!),
    enabled: !!token,
  });
  const devicesQ = useQuery({
    queryKey: ['notif-devices'],
    queryFn: () => api.notifications.devices.list(token!),
    enabled: !!token,
  });

  const muteM = useMutation({
    mutationFn: (input: { channel: NotificationChannel; muted: boolean }) =>
      api.notifications.prefs.update(token!, {
        channel: input.channel,
        topic: '*',
        muted: input.muted,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-prefs'] }),
  });

  const unlinkLineM = useMutation({
    mutationFn: () => api.notifications.line.unlink(token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-line'] }),
  });

  if (!token) {
    return (
      <div className="container-app py-10">
        <EmptyState
          title="ล็อกอินก่อน"
          description="เข้าระบบเพื่อตั้งค่าการแจ้งเตือน"
          action={
            <Link
              href="/login"
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow"
            >
              เข้าสู่ระบบ
            </Link>
          }
        />
      </div>
    );
  }

  const cfg = configQ.data;
  const mutedSet = new Set(
    (prefsQ.data ?? [])
      .filter((p) => p.muted && p.topic === '*')
      .map((p) => p.channel),
  );

  const browserSubscribed = (pushSubsQ.data ?? []).length > 0;
  const supportsPush = isPushSupported();
  const perm = notificationPermission();

  async function handleEnablePush(): Promise<void> {
    if (!cfg?.vapidPublicKey) return;
    setPushBusy(true);
    try {
      const payload = await subscribeBrowserPush(cfg.vapidPublicKey);
      if (!payload) {
        setTestResult('เปิดสิทธิ์ไม่ได้ — เช็คการตั้งค่าเบราว์เซอร์');
        return;
      }
      await api.notifications.push.subscribe(token!, payload);
      await qc.invalidateQueries({ queryKey: ['notif-push'] });
      setTestResult('เปิดการแจ้งเตือนสำเร็จ');
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePush(): Promise<void> {
    setPushBusy(true);
    try {
      const endpoint = await unsubscribeBrowserPush();
      const subs = pushSubsQ.data ?? [];
      const targets = endpoint
        ? [endpoint]
        : subs.map((s) => s.endpoint);
      await Promise.all(
        targets.map((e) => api.notifications.push.unsubscribe(token!, e)),
      );
      await qc.invalidateQueries({ queryKey: ['notif-push'] });
    } finally {
      setPushBusy(false);
    }
  }

  async function handleEnableNativePush(): Promise<void> {
    if (!token) return;
    setNativePushBusy(true);
    setNativeResult(null);
    try {
      const result = await registerNativePush(token);
      if (result) {
        setNativeResult('เปิด push สำเร็จ — token ลงทะเบียนแล้ว');
        await qc.invalidateQueries({ queryKey: ['notif-devices'] });
        await getPushPermission().then(setNativePerm);
      } else {
        const perm = await getPushPermission();
        setNativePerm(perm);
        setNativeResult(
          perm === 'denied'
            ? 'ถูกบล็อก — เปิดการแจ้งเตือนจากการตั้งค่ามือถือ'
            : 'ไม่สำเร็จ — ลองอีกครั้งหรือเช็คสัญญาณเน็ต',
        );
      }
    } finally {
      setNativePushBusy(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTestBusy(true);
    try {
      const out = await api.notifications.test(token!);
      const okList = out.results
        .filter((r) => r.status === 'OK')
        .map((r) => r.channel);
      const skipList = out.results
        .filter((r) => r.status === 'SKIPPED')
        .map((r) => r.channel);
      setTestResult(
        okList.length > 0
          ? `ส่งสำเร็จ: ${okList.join(', ')}${
              skipList.length ? ` · ข้าม: ${skipList.join(', ')}` : ''
            }`
          : `ไม่มี channel พร้อมใช้งาน (ข้าม: ${skipList.join(', ') || 'ทั้งหมด'})`,
      );
      await qc.invalidateQueries({ queryKey: ['inbox'] });
    } finally {
      setTestBusy(false);
    }
  }

  const rows: ChannelRow[] = cfg
    ? [
        {
          channel: 'INAPP',
          label: 'กล่องข้อความ (Inbox)',
          description: 'ปรากฏที่หน้า /inbox เปิดได้เสมอ',
          enabled: true,
        },
        {
          channel: 'WEB_PUSH',
          label: 'Web Push',
          description: browserSubscribed
            ? 'เปิดอยู่บนเบราว์เซอร์นี้'
            : supportsPush
              ? 'แจ้งเตือนผ่านเบราว์เซอร์/PWA'
              : 'เบราว์เซอร์ไม่รองรับ',
          enabled: cfg.webPushEnabled,
          badge: browserSubscribed
            ? 'เปิดอยู่'
            : perm === 'denied'
              ? 'ถูกบล็อก'
              : undefined,
        },
        {
          channel: 'FCM',
          label: 'Push บน Android (FCM)',
          description: 'ผ่านแอป Capacitor — จะลงทะเบียนอัตโนมัติเมื่อเปิดแอป',
          enabled: cfg.fcmEnabled,
        },
        {
          channel: 'APNS',
          label: 'Push บน iOS (APNs)',
          description: 'ผ่านแอป Capacitor — จะลงทะเบียนอัตโนมัติเมื่อเปิดแอป',
          enabled: cfg.apnsEnabled || cfg.fcmEnabled,
        },
        {
          channel: 'EMAIL',
          label: 'Email',
          description: cfg.emailEnabled
            ? 'ส่งสรุปและโปรโมชั่นไปที่อีเมล'
            : 'ผู้ดูแลยังไม่ตั้งค่าผู้ให้บริการอีเมล',
          enabled: cfg.emailEnabled,
        },
        {
          channel: 'LINE',
          label: 'LINE OA',
          description: lineQ.data
            ? `เชื่อม LINE: ${lineQ.data.displayName ?? lineQ.data.lineUserId}`
            : cfg.lineEnabled
              ? 'ส่งข้อความผ่าน LINE OA หลังจากเชื่อมบัญชี'
              : 'ผู้ดูแลยังไม่ตั้งค่า LINE OA',
          enabled: cfg.lineEnabled,
          badge: lineQ.data ? 'เชื่อมแล้ว' : undefined,
        },
      ]
    : [];

  return (
    <div className="container-app space-y-4 pb-24 pt-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Notifications
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          การแจ้งเตือน
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          เลือกช่องทางที่ต้องการให้ NP Commerce ส่งข่าวสารและอัปเดตคำสั่งซื้อ
        </p>
      </header>

      {/* Native push (Capacitor iOS/Android) — รากฐาน Phase 16 */}
      {onNative ? (
        <Card>
          <CardHeader>
            <CardTitle>มือถือเครื่องนี้</CardTitle>
          </CardHeader>
          <p className="text-xs text-ink-600">
            {nativePerm === 'granted'
              ? 'การแจ้งเตือนเปิดอยู่ — ระบบจะส่ง push เมื่อมีออเดอร์ใหม่หรือโปรพิเศษ'
              : nativePerm === 'denied'
                ? 'ถูกบล็อก — เปิด "การตั้งค่า → แจ้งเตือน → NP Commerce" จากระบบมือถือ'
                : 'เปิดเพื่อรับ push สำคัญ เช่น สถานะออเดอร์ จัดส่ง โปรลด'}
          </p>
          <div className="mt-3">
            <Button
              size="sm"
              loading={nativePushBusy}
              disabled={nativePerm === 'denied'}
              onClick={handleEnableNativePush}
            >
              {nativePerm === 'granted' ? 'ลงทะเบียนใหม่' : 'เปิดการแจ้งเตือน'}
            </Button>
          </div>
          {nativeResult ? (
            <p className="mt-2 text-[11px] text-ink-500">{nativeResult}</p>
          ) : null}
        </Card>
      ) : null}

      {/* Quick action: enable/disable web push on this device */}
      <Card>
        <CardHeader>
          <CardTitle>{onNative ? 'เบราว์เซอร์' : 'เบราว์เซอร์นี้'}</CardTitle>
        </CardHeader>
        <p className="text-xs text-ink-600">
          {!supportsPush
            ? 'เบราว์เซอร์/อุปกรณ์นี้ไม่รองรับ Web Push (ลองใช้ Chrome หรือ Safari iOS 16.4+ ที่ติดตั้ง PWA)'
            : browserSubscribed
              ? 'การแจ้งเตือนผ่านเบราว์เซอร์นี้กำลังทำงาน'
              : perm === 'denied'
                ? 'ถูกบล็อกจากเบราว์เซอร์ — เปิดในการตั้งค่าเว็บไซต์'
                : 'เปิดเพื่อรับข่าวสารแม้ปิดหน้าเว็บไว้'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {browserSubscribed ? (
            <Button
              size="sm"
              variant="outline"
              loading={pushBusy}
              onClick={handleDisablePush}
            >
              ปิดการแจ้งเตือน
            </Button>
          ) : (
            <Button
              size="sm"
              loading={pushBusy}
              disabled={
                !supportsPush ||
                !cfg?.webPushEnabled ||
                !cfg?.vapidPublicKey ||
                perm === 'denied'
              }
              onClick={handleEnablePush}
            >
              เปิดการแจ้งเตือน
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            loading={testBusy}
            onClick={handleTest}
          >
            ส่งทดสอบ
          </Button>
        </div>
        {testResult ? (
          <p className="mt-2 text-[11px] text-ink-500">{testResult}</p>
        ) : null}
      </Card>

      {/* Channels & opt-out */}
      <Card>
        <CardHeader>
          <CardTitle>ช่องทาง</CardTitle>
        </CardHeader>
        {configQ.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const muted = mutedSet.has(r.channel);
              const disabled = !r.enabled;
              return (
                <li
                  key={r.channel}
                  className={cn(
                    'flex items-center justify-between rounded-2xl border p-3',
                    disabled
                      ? 'border-ink-100 bg-ink-50/40 opacity-60'
                      : 'border-ink-100 bg-white',
                  )}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                      {r.label}
                      {r.badge ? (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand">
                          {r.badge}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-500">
                      {r.description}
                    </p>
                  </div>
                  <Toggle
                    checked={!muted && r.enabled}
                    disabled={disabled || r.channel === 'INAPP'}
                    onChange={(next) =>
                      muteM.mutate({
                        channel: r.channel,
                        muted: !next,
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Devices */}
      <Card>
        <CardHeader>
          <CardTitle>อุปกรณ์ที่ลงทะเบียนแล้ว</CardTitle>
        </CardHeader>
        {devicesQ.isLoading ? (
          <Skeleton className="h-10 rounded-xl" />
        ) : !devicesQ.data || devicesQ.data.length === 0 ? (
          <p className="text-xs text-ink-500">
            ยังไม่มีอุปกรณ์ลงทะเบียน เปิดแอปบนมือถือเพื่อสมัครรับ push อัตโนมัติ
          </p>
        ) : (
          <ul className="space-y-1.5">
            {devicesQ.data.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl bg-ink-50/60 px-3 py-2 text-[11px]"
              >
                <span className="font-semibold text-ink-900">
                  {d.platform.toUpperCase()}
                </span>
                <span className="font-mono text-[10px] text-ink-500">
                  …{d.token.slice(-12)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* LINE */}
      <Card>
        <CardHeader>
          <CardTitle>เชื่อมต่อ LINE</CardTitle>
        </CardHeader>
        {!cfg?.lineEnabled ? (
          <p className="text-xs text-ink-500">
            ผู้ดูแลระบบยังไม่ได้เปิดใช้งาน LINE OA
          </p>
        ) : lineQ.data ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {lineQ.data.displayName ?? lineQ.data.lineUserId}
              </p>
              <p className="text-[11px] text-ink-500">
                เชื่อมเมื่อ{' '}
                {new Date(lineQ.data.createdAt).toLocaleDateString('th-TH')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => unlinkLineM.mutate()}
            >
              ตัดการเชื่อมต่อ
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-ink-500">
              ใช้ LIFF (LINE Login) เพื่อเชื่อมบัญชี — UI ติดตั้งใน Phase 9.2
            </p>
            {cfg.lineLiffId ? (
              <p className="mt-1 text-[10px] font-mono text-ink-400">
                LIFF ID: {cfg.lineLiffId}
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition',
        checked ? 'bg-brand-gradient' : 'bg-ink-200',
        disabled && 'opacity-40',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}
