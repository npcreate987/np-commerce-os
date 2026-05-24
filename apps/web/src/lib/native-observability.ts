/**
 * Phase 18 — Native observability bridge.
 *
 * `@sentry/capacitor` ห่อทับ `@sentry/browser` (ที่ `@sentry/nextjs` ใช้อยู่
 * แล้วใน `sentry.client.config.ts`) แล้วต่อกับ native SDK (Sentry-Cocoa
 * บน iOS, sentry-java บน Android) เพื่อ
 *
 *   1) จับ uncaught NSException / Java throwable ที่ JS bridge มองไม่เห็น
 *   2) เก็บ ANR (App Not Responding) — Android: watchdog 5s, iOS: hang detection
 *   3) สร้าง release/dist tag ตรงกับ build number จริงของ TestFlight/Play
 *      เพื่อจับคู่ stacktrace กับ dSYM / ProGuard mapping ที่ Fastlane อัปโหลด
 *
 * เราออกแบบเป็น **optional peer dependency** เหมือน ATT — ถ้า
 * `@sentry/capacitor` ไม่ได้ลง (เช่น dev/web bundle) ฟังก์ชันนี้ no-op
 * เงียบ ๆ และ `@sentry/nextjs` ที่ลงไว้แล้วจะรับ browser-level errors แทน
 *
 * Install เมื่อพร้อม:
 *   pnpm --filter web add @sentry/capacitor
 *   pnpm cap sync
 *
 * Env vars ที่ใช้ (ทั้ง web และ native ใช้ค่าเดียวกัน):
 *   NEXT_PUBLIC_SENTRY_DSN              — DSN กลาง (กำหนดเป้าโครงการบน Sentry)
 *   NEXT_PUBLIC_SENTRY_ENVIRONMENT      — production / staging / dev
 *   NEXT_PUBLIC_SENTRY_RELEASE          — `app.np.commerce@${version}+${build}`
 *   NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE — perf trace rate (0..1)
 *   NEXT_PUBLIC_SENTRY_ANR_TIMEOUT_MS   — default 5000 (Android only)
 */

import { getAppInfo, getPlatform, isNative } from './native';

let initialised = false;

/**
 * Initialise Sentry Capacitor on first call. Safe to call multiple times
 * (idempotent). Web returns early so we don't double-init `@sentry/browser`
 * which `@sentry/nextjs` already wired.
 *
 * Call once from `NativeBridge` after the splash screen has hidden — we
 * want crashes during early bootstrap to be captured too, so the earliest
 * we can defer is "first React render".
 */
export async function initNativeObservability(): Promise<void> {
  if (initialised) return;
  if (!isNative()) return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  try {
    const cap = await import('@sentry/capacitor');

    const appInfo = await getAppInfo();
    const platform = getPlatform();
    const release =
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
      (appInfo
        ? `${appInfo.appId}@${appInfo.appVersion}+${appInfo.appBuild}`
        : undefined);
    const environment =
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NODE_ENV ??
      'production';
    const anrTimeoutMs = Number(
      process.env.NEXT_PUBLIC_SENTRY_ANR_TIMEOUT_MS ?? '5000',
    );

    // ANR + watchdog config — Sentry-Cocoa ใช้ค่า hang threshold ของตัวเอง
    // (2s default), sentry-java ใช้ค่านี้เป็น threshold ของ ANR worker.
    // Sentry Capacitor SDK passes these to the native side via the bridge.
    const nativeOptions: Record<string, unknown> = {
      enableAutoSessionTracking: true,
      enableNativeCrashHandling: true,
      enableNdkScopeSync: platform === 'android',
      enableWatchdogTerminationTracking: platform === 'ios',
      anrEnabled: platform === 'android',
      anrTimeoutIntervalMillis: anrTimeoutMs,
    };

    cap.init({
      dsn,
      release,
      dist: appInfo?.appBuild,
      environment,
      // ตอนนี้เก็บ trace แค่ 0% เพื่อไม่กิน quota; bump ผ่าน env เมื่อ
      // ต้องตามจับ slow-screen เฉพาะกิจ
      tracesSampleRate: Number(
        process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0',
      ),
      // Attach `tags.platform` ทุก event — ทำ filter ง่ายในแดชบอร์ด
      initialScope: {
        tags: {
          platform,
          shell: 'capacitor',
          appBuild: appInfo?.appBuild ?? 'unknown',
        },
      },
      ...nativeOptions,
    });

    initialised = true;
  } catch {
    /* plugin not installed → silent, keep web-level Sentry as fallback */
  }
}

/**
 * Capture a structured native breadcrumb — useful for tracing user flow
 * before a crash (e.g. "checkout_started" → "payment_pending" → crash).
 * No-op on web (use `@sentry/nextjs` directly there).
 */
export async function nativeBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  category: string = 'app',
): Promise<void> {
  if (!isNative() || !initialised) return;
  try {
    const cap = await import('@sentry/capacitor');
    cap.addBreadcrumb({
      message,
      category,
      level: 'info',
      data,
      timestamp: Date.now() / 1000,
    });
  } catch {
    /* noop */
  }
}

/**
 * Capture an exception from JS that would otherwise be swallowed (catch
 * blocks, promise rejection handlers). On native this routes through the
 * Sentry Capacitor bridge → native SDK → batched delivery.
 */
export async function captureNativeException(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!isNative() || !initialised) return;
  try {
    const cap = await import('@sentry/capacitor');
    if (context) {
      cap.withScope((scope) => {
        scope.setExtras(context);
        cap.captureException(err);
      });
    } else {
      cap.captureException(err);
    }
  } catch {
    /* noop */
  }
}

/**
 * Attach the currently-logged-in user to all subsequent native events.
 * Call from auth-store after a successful login; call with null on
 * logout. We only send a stable userId — never PII.
 */
export async function setNativeUser(
  userId: string | null,
): Promise<void> {
  if (!isNative() || !initialised) return;
  try {
    const cap = await import('@sentry/capacitor');
    cap.setUser(userId ? { id: userId } : null);
  } catch {
    /* noop */
  }
}
