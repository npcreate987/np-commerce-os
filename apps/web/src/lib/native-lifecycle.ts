/**
 * Phase 18 — Native lifecycle bridge.
 *
 * เชื่อม `@capacitor/app` events ที่ native shell ส่งมา (state change,
 * deep link open, back-button) เข้ากับ tracker ของ Phase 10.1 และ
 * Sentry breadcrumb เพื่อ:
 *
 *   1) วัด DAU/MAU แยก web vs native, retention curves ต่อ platform
 *   2) ผูก crash report ของ Sentry เข้ากับ event ก่อนหน้า (breadcrumb)
 *   3) Trigger OTA re-check เมื่อ app resume จากพื้นหลัง > 6 ชม.
 *
 * Web: no-op (browser มี visibilitychange ของตัวเองอยู่แล้วใน track.ts)
 *
 * คืน cleanup function — caller (NativeBridge useEffect) เรียกตอน unmount
 */

import { isNative } from './native';
import { nativeBreadcrumb } from './native-observability';
import { tracker } from './track';

let wired = false;

export async function wireNativeLifecycle(): Promise<() => void> {
  if (wired || !isNative()) return () => {};
  wired = true;

  const cleanups: Array<() => void> = [];

  try {
    const { App } = await import('@capacitor/app');

    // 1) Cold-start fires implicit app_open. Capacitor doesn't have a
    //    dedicated "cold-start" event — we emit it manually here. Resume
    //    after background is handled by 'appStateChange' below.
    tracker.track('app_open', { surface: 'native' });
    await nativeBreadcrumb('app.open', { trigger: 'cold-start' }, 'app');

    // 2) State change (foreground/background)
    const stateHandle = await App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        tracker.track('app_resume', { surface: 'native' });
        void nativeBreadcrumb('app.resume', undefined, 'app');
        // Background-aware OTA re-check — only if last poll was > TTL ago.
        // The check function has its own throttle, so calling on every
        // resume is safe.
        void import('./live-updates').then((m) =>
          m.checkAndApplyLiveUpdate().catch(() => {
            /* swallow */
          }),
        );
      } else {
        tracker.track('app_background', { surface: 'native' });
        void nativeBreadcrumb('app.background', undefined, 'app');
        // Best-effort flush — sendBeacon equivalent for Capacitor.
        void tracker.flush();
      }
    });
    cleanups.push(() => void stateHandle.remove());

    // 3) Deep link openings — already routed to next/navigation in
    //    `wireDeepLinks()`, but we also want telemetry of *which*
    //    deep links matter for attribution analysis (e.g. referral codes,
    //    push deep links, share links).
    const urlHandle = await App.addListener('appUrlOpen', (event) => {
      try {
        const u = new URL(event.url);
        tracker.track('app_url_open', {
          surface: 'deep_link',
          meta: {
            host: u.host,
            path: u.pathname,
            scheme: u.protocol.replace(':', ''),
            query: u.search.slice(0, 256),
          },
        });
        void nativeBreadcrumb(
          'app.url_open',
          { host: u.host, path: u.pathname },
          'app',
        );
      } catch {
        /* malformed URL */
      }
    });
    cleanups.push(() => void urlHandle.remove());

    // 4) Hardware back-button (Android) — emit a breadcrumb for crash
    //    forensics, but don't override default behaviour (Capacitor
    //    routes back to webview history by default).
    try {
      const backHandle = await App.addListener('backButton', (event) => {
        void nativeBreadcrumb(
          'app.back_button',
          { canGoBack: event.canGoBack },
          'app',
        );
      });
      cleanups.push(() => void backHandle.remove());
    } catch {
      /* iOS doesn't emit this — skip */
    }
  } catch {
    wired = false;
  }

  return () => {
    cleanups.forEach((c) => {
      try {
        c();
      } catch {
        /* noop */
      }
    });
    wired = false;
  };
}
