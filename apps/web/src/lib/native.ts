/**
 * Native shell bridge — Capacitor-aware helpers ที่ทำงานได้ทั้ง web และ
 * iOS/Android native shell โดยไม่ต้อง branch ทุกที่
 *
 * รูปแบบการใช้:
 *   import { isNative, getPlatform, safeStorage, registerNativePush,
 *            getCurrentPosition, nativeShare, openExternalUrl,
 *            getAppInfo, getDeviceInfo } from '@/lib/native';
 *
 * Web: ทุกฟังก์ชัน fall-back ไป browser API (navigator.share, geolocation,
 *      window.open, localStorage)
 * Native: เรียก Capacitor plugins (Preferences, PushNotifications, Share,
 *         Geolocation, Browser, App, Device, ...)
 *
 * ออกแบบให้ tree-shake ได้: ทุก plugin ที่ใช้ใน native ถูก dynamic-import
 * ตอนที่ตรวจว่าอยู่ในแอปจริงเท่านั้น → web bundle ไม่โดน Capacitor SDK
 */

import { api } from './api';

type Platform = 'web' | 'ios' | 'android';

let capacitorCore:
  | typeof import('@capacitor/core')
  | null
  | undefined = undefined;

async function loadCore() {
  if (capacitorCore !== undefined) return capacitorCore;
  if (typeof window === 'undefined') {
    capacitorCore = null;
    return null;
  }
  try {
    capacitorCore = await import('@capacitor/core');
  } catch {
    capacitorCore = null;
  }
  return capacitorCore;
}

export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Synchronous Capacitor detection — checks the bridge property that the
 * native shell injects before the first paint. Safe to call during SSR
 * (returns false).
 */
export function isNative(): boolean {
  if (!isBrowser()) return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

export function getPlatform(): Platform {
  if (!isBrowser()) return 'web';
  const w = window as unknown as {
    Capacitor?: { getPlatform?: () => string };
  };
  const p = w.Capacitor?.getPlatform?.();
  if (p === 'ios' || p === 'android') return p;
  return 'web';
}

// =============================================================================
// Safe storage — Preferences plugin on native, localStorage on web
// =============================================================================

/**
 * Persistent storage — uses Capacitor Preferences on native (survives
 * iOS WKWebView ITP 7-day clearance + Android app data clear with backup),
 * localStorage on web.
 *
 * Use for: refresh tokens, anonId, theme, opt-out flags.
 */
export const safeStorage = {
  async get(key: string): Promise<string | null> {
    if (isNative()) {
      try {
        const mod = await import('@capacitor/preferences');
        const { value } = await mod.Preferences.get({ key });
        return value ?? null;
      } catch {
        return null;
      }
    }
    if (!isBrowser()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (isNative()) {
      try {
        const mod = await import('@capacitor/preferences');
        await mod.Preferences.set({ key, value });
        return;
      } catch {
        return;
      }
    }
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* quota exceeded — silent */
    }
  },
  async remove(key: string): Promise<void> {
    if (isNative()) {
      try {
        const mod = await import('@capacitor/preferences');
        await mod.Preferences.remove({ key });
        return;
      } catch {
        return;
      }
    }
    if (!isBrowser()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  },
};

// =============================================================================
// Push notifications (FCM + APNs via Capacitor)
// =============================================================================

/**
 * Native push registration — wires FCM (Android) + APNs (iOS) tokens
 * back into our existing `/v1/notifications/devices` endpoint that
 * was built in Phase 9.1.
 *
 * Safe no-op on web. Returns the token on success, null on failure
 * (permission denied, plugin missing, network error).
 */
export async function registerNativePush(authToken: string): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const pn = await import('@capacitor/push-notifications');
    const { PushNotifications } = pn;

    const perm = await PushNotifications.checkPermissions();
    let state = perm.receive;
    if (state === 'prompt' || state === 'prompt-with-rationale') {
      const requested = await PushNotifications.requestPermissions();
      state = requested.receive;
    }
    if (state !== 'granted') return null;

    return await new Promise<string | null>((resolve) => {
      const cleanups: Array<() => Promise<unknown> | unknown> = [];
      const cleanup = async () => {
        for (const c of cleanups) {
          try {
            await c();
          } catch {
            /* noop */
          }
        }
      };

      PushNotifications.addListener('registration', async (t) => {
        try {
          const platform = getPlatform();
          await api.notifications.devices.register(authToken, {
            token: t.value,
            platform: platform === 'ios' || platform === 'android' ? platform : 'web',
          });
        } catch {
          /* surface via Sentry in caller — never throw inside listener */
        }
        await cleanup();
        resolve(t.value);
      }).then((h) => cleanups.push(() => h.remove()));

      PushNotifications.addListener('registrationError', async () => {
        await cleanup();
        resolve(null);
      }).then((h) => cleanups.push(() => h.remove()));

      void PushNotifications.register();
    });
  } catch {
    return null;
  }
}

/**
 * Read current push permission state without prompting. Used by UI to
 * show appropriate enable/disable button copy.
 */
export async function getPushPermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (!isNative()) return 'unsupported';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'granted') return 'granted';
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

// =============================================================================
// Splash + deep links
// =============================================================================

/**
 * Hide native splash screen — call once when the app is fully hydrated
 * and ready to interact. Safe to call on web (no-op).
 */
export async function hideNativeSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const mod = await import('@capacitor/splash-screen');
    await mod.SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* noop */
  }
}

/**
 * Listen to deep-link openings (Universal Links / App Links / custom scheme)
 * and forward the parsed URL to a router push callback.
 *
 * Signature: `push(path, fullUrl)` — the second argument is the raw URL so
 * callers can branch on custom schemes (e.g. `npcommerce://login-success`)
 * before falling back to a router navigation.
 *
 * Example wiring from layout.tsx:
 *   wireDeepLinks((path) => router.push(path));
 *
 * Returns a cleanup function.
 */
export async function wireDeepLinks(
  push: (path: string, fullUrl: string) => void | Promise<void>,
): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const mod = await import('@capacitor/app');
    const handle = await mod.App.addListener('appUrlOpen', (event) => {
      try {
        const url = new URL(event.url);
        const path = `${url.pathname}${url.search}${url.hash}`;
        void push(path || '/', event.url);
      } catch {
        /* malformed URL — ignore */
      }
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}

// =============================================================================
// Device + app info (for force-update + analytics)
// =============================================================================

export interface AppInfo {
  appId: string;
  appVersion: string; // e.g. "1.2.3"
  appBuild: string; // e.g. "12345" (semver-incompatible — for OTA tracking)
  platform: Platform;
}

export interface DeviceInfo {
  model: string;
  osVersion: string;
  manufacturer: string;
  webViewVersion: string;
  isVirtual: boolean;
}

/**
 * Get bundled app version info. On web returns the build hash from env
 * (NEXT_PUBLIC_APP_VERSION at build time).
 */
export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isNative()) {
    return {
      appId: 'app.np.commerce.web',
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
      appBuild: process.env.NEXT_PUBLIC_APP_BUILD ?? 'web',
      platform: 'web',
    };
  }
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return {
      appId: info.id,
      appVersion: info.version,
      appBuild: info.build,
      platform: getPlatform(),
    };
  } catch {
    return null;
  }
}

export async function getDeviceInfo(): Promise<DeviceInfo | null> {
  if (!isNative()) return null;
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    return {
      model: info.model,
      osVersion: info.osVersion,
      manufacturer: info.manufacturer,
      webViewVersion: info.webViewVersion,
      isVirtual: info.isVirtual,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Geolocation
// =============================================================================

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
  source: 'gps' | 'fallback';
}

/**
 * Get current device position — uses Capacitor Geolocation on native
 * (proper iOS Info.plist permission, Android runtime permission),
 * `navigator.geolocation` on web.
 *
 * Returns null on permission denied or timeout. Caller should fall back
 * to a default position (e.g. Bangkok center).
 */
export async function getCurrentPosition(opts?: {
  timeoutMs?: number;
  highAccuracy?: boolean;
}): Promise<Position | null> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const highAccuracy = opts?.highAccuracy ?? false;

  if (isNative()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const requested = await Geolocation.requestPermissions({
          permissions: ['location'],
        });
        if (requested.location !== 'granted') return null;
      }
      const result = await Geolocation.getCurrentPosition({
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
      });
      return {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy,
        source: 'gps',
      };
    } catch {
      return null;
    }
  }

  if (!isBrowser() || !('geolocation' in navigator)) return null;
  return new Promise<Position | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          source: 'gps',
        }),
      () => resolve(null),
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs },
    );
  });
}

// =============================================================================
// Share + browser
// =============================================================================

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

/**
 * Native share — Capacitor Share on iOS/Android, navigator.share on web
 * (Chrome/Safari), clipboard fallback otherwise. Returns true if user
 * completed the share, false if cancelled.
 */
export async function nativeShare(opts: ShareOptions): Promise<boolean> {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      const can = await Share.canShare();
      if (!can.value) return false;
      await Share.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
        dialogTitle: opts.dialogTitle,
      });
      return true;
    } catch {
      // User cancelled → returns error in some versions; treat as no-op
      return false;
    }
  }

  if (
    isBrowser() &&
    typeof navigator !== 'undefined' &&
    'share' in navigator &&
    typeof navigator.share === 'function'
  ) {
    try {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      });
      return true;
    } catch {
      return false;
    }
  }

  // Last-resort clipboard
  if (
    isBrowser() &&
    opts.url &&
    typeof navigator !== 'undefined' &&
    'clipboard' in navigator
  ) {
    try {
      await navigator.clipboard.writeText(opts.url);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Open URL in an in-app browser (Capacitor Browser plugin on native,
 * `window.open` with `_blank` on web). Use for external links (3rd-party
 * checkout, LINE OA, OAuth flow) so the user stays inside the app.
 */
export async function openExternalUrl(
  url: string,
  opts?: { presentationStyle?: 'fullscreen' | 'popover' },
): Promise<void> {
  if (isNative()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({
        url,
        presentationStyle: opts?.presentationStyle ?? 'fullscreen',
        toolbarColor: '#FF3E5C',
      });
      return;
    } catch {
      // fall through
    }
  }
  if (isBrowser()) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// =============================================================================
// App Tracking Transparency (iOS 14.5+)
// =============================================================================

export type ATTStatus =
  | 'authorized' // user tapped Allow
  | 'denied' // user tapped Don't Allow (cannot prompt again)
  | 'restricted' // parental controls / MDM
  | 'notDetermined' // never prompted
  | 'unsupported'; // Android / web / iOS < 14.5

/**
 * Read current ATT status without prompting. Used to decide whether
 * behavioural tracking is allowed and whether the consent dialog should
 * be shown.
 *
 * Note: when the package `@capgo/capacitor-app-tracking-transparency`
 * is not installed (current default), this returns `'unsupported'` and
 * we treat the user as having declined behavioural collection
 * (privacy-first default).
 *
 * Phase 17 — to enable the actual native prompt, install:
 *   pnpm --filter web add @capgo/capacitor-app-tracking-transparency
 *
 * then `pnpm cap sync` and the helper will start returning real values.
 *
 * Webpack note: the `webpackIgnore: true` directive tells the bundler
 * to skip resolving this module at compile time — the import becomes
 * a runtime `import()` that throws `Module not found` if the package
 * isn't installed. The surrounding `try/catch` then returns
 * `'unsupported'` (intended behaviour).
 */
export async function getATTStatus(): Promise<ATTStatus> {
  if (getPlatform() !== 'ios') return 'unsupported';
  try {
    const mod = (await import(
      /* webpackIgnore: true */ /* @vite-ignore */
      // @ts-expect-error — optional peer dep; consumers install on demand
      '@capgo/capacitor-app-tracking-transparency'
    )) as {
      AppTrackingTransparency: {
        getStatus: () => Promise<{ status: string }>;
      };
    };
    const r = await mod.AppTrackingTransparency.getStatus();
    if (r.status === 'authorized') return 'authorized';
    if (r.status === 'denied') return 'denied';
    if (r.status === 'restricted') return 'restricted';
    return 'notDetermined';
  } catch {
    return 'unsupported';
  }
}

/**
 * Request ATT permission — must be called from a user-initiated UI flow
 * (Apple requires a tap-to-trigger, not on app launch). Returns the
 * resulting status.
 *
 * On iOS < 14.5, Android, web, or when the plugin is not installed,
 * returns `'unsupported'` and the caller should treat the user as
 * declined.
 */
export async function requestATTPermission(): Promise<ATTStatus> {
  if (getPlatform() !== 'ios') return 'unsupported';
  try {
    const mod = (await import(
      /* webpackIgnore: true */ /* @vite-ignore */
      // @ts-expect-error — optional peer dep
      '@capgo/capacitor-app-tracking-transparency'
    )) as {
      AppTrackingTransparency: {
        requestPermission: () => Promise<{ status: string }>;
      };
    };
    const r = await mod.AppTrackingTransparency.requestPermission();
    if (r.status === 'authorized') return 'authorized';
    if (r.status === 'denied') return 'denied';
    if (r.status === 'restricted') return 'restricted';
    return 'notDetermined';
  } catch {
    return 'unsupported';
  }
}

// =============================================================================
// Network status
// =============================================================================

export interface NetworkStatus {
  connected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (isNative()) {
    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      const type = status.connectionType;
      const normalised: NetworkStatus['connectionType'] =
        type === 'wifi'
          ? 'wifi'
          : type === 'cellular'
            ? 'cellular'
            : type === 'none'
              ? 'none'
              : 'unknown';
      return { connected: status.connected, connectionType: normalised };
    } catch {
      /* fall through */
    }
  }
  if (isBrowser() && 'onLine' in navigator) {
    const conn = (navigator as Navigator & {
      connection?: { type?: string; effectiveType?: string };
    }).connection;
    return {
      connected: navigator.onLine,
      connectionType:
        conn?.type === 'wifi'
          ? 'wifi'
          : conn?.type === 'cellular'
            ? 'cellular'
            : conn?.effectiveType
              ? 'cellular'
              : 'unknown',
    };
  }
  return { connected: true, connectionType: 'unknown' };
}

// =============================================================================
// Bootstrap (called once from a top-level provider on the client)
// =============================================================================

/**
 * Touch the loaded core so bundlers know we *might* need it — pure side
 * effect, called once from a top-level provider on the client.
 *
 * Phase 18: also bootstraps `@sentry/capacitor` (when installed) so native
 * crashes + ANR are reported alongside the web-level `@sentry/nextjs`
 * stream. Lives in a separate file to keep `lib/native.ts` free of any
 * Sentry imports (`@sentry/capacitor` pulls a few MB).
 */
export async function bootstrapNative(): Promise<void> {
  if (!isBrowser()) return;
  await loadCore();
  if (isNative()) {
    try {
      const obs = await import('./native-observability');
      await obs.initNativeObservability();
    } catch {
      /* observability bootstrap should never block the app */
    }
  }
}
