import type { CapacitorConfig } from '@capacitor/cli';

/**
 * NP Commerce OS — Capacitor config
 *
 * โหมดการใช้งาน:
 * 1) Dev (live reload จากเครื่อง dev):
 *    - ตั้ง CAP_SERVER_URL=http://<LAN-IP>:3000 (หรือ port ที่ใช้)
 *    - มือถือ + Mac ต้อง WiFi เดียวกัน
 *    - command: pnpm cap:dev:ios  หรือ  pnpm cap:dev:android
 *
 * 2) Production (static export bundled in app):
 *    - BUILD_STATIC=true next build  → ได้ folder `out/`
 *    - pnpm cap:sync  →  copy out/ เข้า iOS/Android
 *    - pnpm cap:open:ios  →  Xcode build & sign
 *    - pnpm cap:open:android  →  Android Studio build APK/AAB
 */

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'app.np.commerce',
  appName: 'NP Commerce',
  webDir: 'out',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff',
  },
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: true, // dev only — ปิดใน prod
  },
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: true,
      }
    : {
        androidScheme: 'https',
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#FF3E5C',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FF3E5C',
    },
  },
};

export default config;
