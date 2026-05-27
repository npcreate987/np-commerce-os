import type { CapacitorConfig } from '@capacitor/cli';

/**
 * TuKTuK (NP Commerce OS) — Capacitor config (Phase 15)
 *
 * Branding
 * --------
 * Display name = "TuKTuK" (see `appName` below + iOS Info.plist
 * `CFBundleDisplayName` + Android `strings.xml` `app_name`).
 *
 * `appId` keeps the historical bundle identifier `app.np.commerce` because
 * changing it would invalidate signing certificates and the App Store / Play
 * Store records. The user-visible name is what's changing.
 *
 * โหมดการใช้งาน:
 * 1) Dev (live reload จากเครื่อง dev):
 *    - ตั้ง CAP_SERVER_URL=http://<LAN-IP>:3000
 *    - มือถือ + Mac ต้อง WiFi เดียวกัน
 *    - command: pnpm cap:dev:ios  หรือ  pnpm cap:dev:android
 *
 * 2) Production (static export bundled in app — ของ Phase 15 ✅):
 *    - BUILD_STATIC=true pnpm build  → ได้ folder `out/`
 *    - pnpm cap:sync  →  copy out/ เข้า iOS/Android
 *    - pnpm cap:open:ios  →  Xcode build & sign
 *    - pnpm cap:open:android  →  Android Studio build APK/AAB
 *
 * Universal Links / App Links (Deep linking):
 * - iOS: ใส่ Associated Domains `applinks:np.app` ใน Xcode + วาง
 *   `apple-app-site-association` ที่ `https://np.app/.well-known/`
 * - Android: เพิ่ม intent filter `autoVerify=true` ใน AndroidManifest + วาง
 *   `assetlinks.json` ที่ `https://np.app/.well-known/`
 * - ใช้คู่กับ `App.addListener('appUrlOpen', ...)` ใน lib/native.ts
 */

const isDev = !!process.env.CAP_SERVER_URL;
const isProd = process.env.NODE_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'app.np.commerce',
  appName: 'TuKTuK',
  webDir: 'out',
  loggingBehavior: isProd ? 'none' : 'debug',
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff',
    limitsNavigationsToAppBoundDomains: false,
    scheme: 'NPCommerce',
  },
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: !isProd,
    captureInput: true,
    // Phase 19.2 dry-run — เปิด chrome://inspect/#devices ชั่วคราวเพื่อดู
    // console.log + Network จาก WebView ใน release APK. หลัง verify OTA loop
    // เสร็จแล้ว เปลี่ยนกลับเป็น `!isProd` เพื่อปิด debug surface ใน prod
    webContentsDebuggingEnabled: true,
  },
  server: isDev
    ? {
        url: process.env.CAP_SERVER_URL,
        cleartext: true,
        androidScheme: 'http',
      }
    : {
        androidScheme: 'https',
        iosScheme: 'capacitor',
        allowNavigation: [
          'np.app',
          '*.np.app',
          'api.np.app',
        ],
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      // Matches the deep-plum gradient bg of the TuKTuK icon/splash so the
      // launch-image transition reads as a continuous surface.
      backgroundColor: '#1A0B26',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1A0B26',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    App: {
      launchUrl: '',
    },
    Preferences: {
      group: 'NPCommercePrefs',
    },
    Camera: {},
    Geolocation: {},
    // Phase 19.2 / 19.5 — Capgo plugin used ONLY as download/swap runtime.
    // We host manifest + bundles ourselves (Railway API + Cloudflare R2) and
    // call CapacitorUpdater.download() directly from apps/web/src/lib/live-updates.ts.
    //
    // The Capgo Cloud backend (api.capgo.app / plugin.capgo.app) is NOT used.
    // Even with autoUpdate=false, the native plugin still pings its three
    // default Capgo Cloud endpoints (updateUrl, channelUrl, statsUrl) on
    // lifecycle events. Those were causing:
    //   • 429 "on_premise_app" toast (Capgo flagging us as off-plan)
    //   • "Stats batch sent successfully" log noise on every foreground
    //     leak — leaking app usage to a 3rd party we never registered with
    // Setting all three to '' fully decouples the plugin from Capgo Cloud
    // while preserving the local bundle download/install code path.
    CapacitorUpdater: {
      autoUpdate: false,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      resetWhenUpdate: false,
      directUpdate: false,
      updateUrl: '',
      channelUrl: '',
      statsUrl: '',
    },
  },
};

export default config;
