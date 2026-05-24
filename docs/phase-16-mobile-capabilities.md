# Phase 16 — Native Capabilities Wiring

> สถานะ: 🟢 **done** (Phase 16 core)
> วันที่: 2026-05-24
> Stack: Capacitor 6.x + Next.js 14 + NestJS

Phase 16 ปลดล็อก native plugins ของ Capacitor ที่สแกนพร้อมในเฟส 15 ให้
ทำงานจริงผ่าน adapter เดียว (`apps/web/src/lib/native.ts`) — เปิดทาง push
จริง, geolocation, share-sheet, in-app browser, persistent secure storage
และ force-update gate

---

## 1) Adapter ใหม่ — `lib/native.ts`

ไฟล์เดียวที่ห่อ Capacitor APIs ทั้งหมดให้ทำงานได้ทั้ง **web** และ
**native**

| Export | Web fallback | Native impl |
| --- | --- | --- |
| `isNative()`, `getPlatform()` | `false` / `'web'` | `Capacitor.isNativePlatform()` |
| `safeStorage.get/set/remove` | `localStorage` | `@capacitor/preferences` |
| `registerNativePush(token)` | no-op (null) | `@capacitor/push-notifications` + `api.notifications.devices.register` |
| `getPushPermission()` | `'unsupported'` | `PushNotifications.checkPermissions` |
| `hideNativeSplash()` | no-op | `@capacitor/splash-screen` |
| `wireDeepLinks(push)` | no-op | `@capacitor/app` (appUrlOpen) |
| `getAppInfo()` | env vars | `App.getInfo()` |
| `getDeviceInfo()` | null | `@capacitor/device` |
| `getCurrentPosition(opts)` | `navigator.geolocation` | `@capacitor/geolocation` (with permission flow) |
| `nativeShare(opts)` | `navigator.share` → clipboard | `@capacitor/share` |
| `openExternalUrl(url)` | `window.open` | `@capacitor/browser` (in-app browser) |
| `getNetworkStatus()` | `navigator.onLine` | `@capacitor/network` |

ทุก plugin ถูก `dynamic import` ลึก เพื่อ tree-shake ฝั่ง web ออกได้ —
bundle web ไม่โดน Capacitor SDK

---

## 2) Auth + safe storage

`apps/web/src/stores/auth-store.ts`
- เปลี่ยน zustand persist storage → `createJSONStorage(() => platformStorage)`
- Native: Capacitor Preferences (รอด iOS WKWebView ITP 7-day clear)
- Web: localStorage (ไม่กระทบ user เดิม)
- เพิ่ม `migrate()` คัด legacy localStorage → Preferences ครั้งเดียวเมื่อ user
  upgrade จาก PWA → native app

---

## 3) Native push UI — `/profile/notifications`

เพิ่ม Card ใหม่ "มือถือเครื่องนี้" ที่แสดงเฉพาะ `isNative()`:
- แสดงสถานะ permission (granted / denied / prompt)
- ปุ่ม "เปิดการแจ้งเตือน" → เรียก `registerNativePush(token)` → APNs/FCM
  token ถูกส่งเข้า `/v1/notifications/devices`
- ส่วน "อุปกรณ์ที่ลงทะเบียนแล้ว" ใช้ `notif-devices` query เดิม จึงเห็น
  device list ทันที

หมายเหตุ — `NativeBridge` (Phase 15) ก็ยัง auto-register ตอน app boot
อยู่ ปุ่มเปิดเมนูนี้คือสำหรับเคสที่ user เคยกด Deny แล้วอยากเปิดใหม่

---

## 4) App version check + force-update gate

**API**: `apps/api/src/common/app-version.controller.ts`
- `GET /v1/app/version?platform=ios&version=1.0.0&build=123`
- คืน `status: 'OK' | 'UPDATE_AVAILABLE' | 'UPDATE_REQUIRED' | 'UNKNOWN'`
- ใช้ env vars:
  - `APP_LATEST_VERSION` (default `1.0.0`)
  - `APP_MIN_SUPPORTED` (default `1.0.0`)
  - `APP_IOS_STORE_URL`, `APP_ANDROID_STORE_URL`
  - `APP_UPDATE_MESSAGE_TH`, `APP_UPDATE_MESSAGE_EN`

**Native gate**: `apps/web/src/components/force-update-gate.tsx`
- ถูก mount ผ่าน `NativeBridge` (อยู่ใน `CustomerShell`)
- ตอน cold-start → `App.getInfo()` → POST query → ถ้า `UPDATE_REQUIRED`
  แสดงหน้า full-screen ปุ่มเดียว "เปิด App/Play Store"
- Re-fetch ทุก 30 นาที (สำหรับเคส server bump min threshold ตอน user
  ยังเปิดแอปอยู่)
- บน web → ฟังก์ชันเป็น no-op (return null)

---

## 5) Universal Links + App Links

### iOS — `apps/web/ios/App/App/App.entitlements` (สร้างใหม่)
- `aps-environment` = `development` (เปลี่ยนเป็น `production` ตอน archive
  สู่ App Store)
- `com.apple.developer.associated-domains` รวม `applinks:np.app`,
  `applinks:app.np.app`, `webcredentials:np.app`
- `keychain-access-groups` สำหรับ shared credentials

### iOS — `apps/web/ios/App/App/Info.plist` (อัปเดต)
- เพิ่ม **purpose strings** ครบ:
  - `NSCameraUsageDescription`
  - `NSPhotoLibraryUsageDescription`
  - `NSPhotoLibraryAddUsageDescription`
  - `NSMicrophoneUsageDescription`
  - `NSLocationWhenInUseUsageDescription`
  - `NSLocationAlwaysAndWhenInUseUsageDescription` (Rider)
  - `NSFaceIDUsageDescription`
  - `NSUserTrackingUsageDescription` (ATT — Phase 17)
- `CFBundleURLTypes` = `npcommerce://` (custom scheme สำหรับ OAuth)
- `UIBackgroundModes` = `remote-notification`
- `NSAppTransportSecurity.NSAllowsLocalNetworking` = true (dev LAN)

### Android — `apps/web/android/app/src/main/AndroidManifest.xml`
- เพิ่ม `<intent-filter android:autoVerify="true">` สำหรับ
  `https://np.app/*`
- Custom scheme `<intent-filter>` สำหรับ `npcommerce://`
- Permissions ครบ: INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS,
  COARSE/FINE/BACKGROUND_LOCATION, CAMERA, RECORD_AUDIO,
  READ_MEDIA_IMAGES/VIDEO, USE_BIOMETRIC, VIBRATE
- `<queries>` สำหรับ Android 11+ ให้แชร์/เปิด external apps ได้

### Production rollout
1. Update domain ใน `.entitlements` + AndroidManifest จาก `np.app` →
   โดเมน production จริง
2. Update `/.well-known/apple-app-site-association` (TEAMID + bundle ID)
3. Update `/.well-known/assetlinks.json` (Play App Signing SHA-256)
4. ตั้ง `aps-environment` → `production` ตอน Archive build
5. ใน Play Console → App content → App links → click "Auto-verify"

---

## 6) Geolocation + Share + Browser swap

แทน `navigator.geolocation` ทั้งหมดด้วย `getCurrentPosition()` helper:
- `apps/web/src/app/(customer)/local/page.tsx`
- `apps/web/src/app/(rider)/rider/dashboard/page.tsx`
- `apps/web/src/app/(merchant)/merchant/local/[shopId]/page.tsx`

แทน `navigator.share` ทั้งหมดด้วย `nativeShare()`:
- `apps/web/src/components/video/video-feed.tsx`
- `apps/web/src/app/(customer)/profile/_shared.tsx`
- `apps/web/src/app/(customer)/rewards/page.tsx`
- `apps/web/src/app/(creator)/creator/links/[id]/page.tsx`

ใน Capacitor → เปิด iOS/Android native share-sheet จริง; ใน web fallback
ไปที่ `navigator.share` หรือ clipboard

---

## 7) Camera (deferred → Phase 16.x)

`<input type="file" accept="video/*" capture="environment">` ใน
`/feed/create` ใช้งานได้ปกติบน Capacitor WebView (เปิดกล้องเนทีฟ
อัตโนมัติ) จึงยังไม่จำเป็นต้องเปลี่ยนเป็น `@capacitor/camera` plugin
ตอนนี้ จะใช้ plugin ต่อเมื่อ:
- เพิ่ม flow ถ่าย **รูปสินค้า** (PDP composer)
- เพิ่ม flow ถ่าย **KYC** (บัตรประชาชน + selfie สำหรับ rider/merchant)
- ต้องการ multi-image picker (`Camera.pickImages`)

---

## 8) Static export — known issue (Phase 16.x)

`BUILD_STATIC=true pnpm exec next build` ยังไม่ผ่าน เพราะ Next.js 14.2
ไม่ resolve `generateStaticParams` ในหน้า dynamic route (`[id]`) ที่
parent layout เป็น `'use client'` (`(creator)/layout.tsx`,
`(rider)/layout.tsx`, `(customer)/profile/[handle]/layout.tsx` ฯลฯ)

**Workaround ระหว่างนี้** — ใช้ Capacitor `server.url` ชี้ไป dev
server (`localhost:3000`) หรือ staging URL แทน static bundle ใน
`capacitor.config.ts`:

```ts
server: {
  url: 'http://192.168.0.34:3000', // หรือ https://staging.np.app
  cleartext: true, // dev LAN เท่านั้น
}
```

**Phase 16.x todo** — refactor layouts ให้เป็น **server components**
และย้าย client logic ลง subcomponent:
- `(creator)/layout.tsx`, `(rider)/layout.tsx`, `(customer)/layout.tsx`
- หรือ ใช้ `output: 'export'` กับ structure ใหม่ที่ทุกหน้าเป็น
  client-rendered SPA ผ่าน catch-all `[[...slug]]` (rewrite ทุก route
  เข้า single `index.html`)

---

## 9) ตัวที่ผ่าน (verification)

```
$ cd apps/web && pnpm typecheck
✓ tsc --noEmit (no errors)

$ cd apps/api && pnpm exec tsc --noEmit | rg app-version
(no AppVersionController errors — pre-existing checkout/order errors
unrelated to Phase 16)

$ pnpm exec cap sync
✔ iOS — 11 plugins
✔ Android — 11 plugins
```

11 plugins synced:
`@capacitor/app`, `@capacitor/browser`, `@capacitor/camera`,
`@capacitor/device`, `@capacitor/geolocation`, `@capacitor/network`,
`@capacitor/preferences`, `@capacitor/push-notifications`,
`@capacitor/share`, `@capacitor/splash-screen`, `@capacitor/status-bar`

---

## 10) ฝั่ง user-visible

| Surface | Before Phase 16 | After Phase 16 |
| --- | --- | --- |
| Refresh token หาย | iOS WKWebView ลบทุก 7 วัน → re-login | Preferences คงไว้ → login ครั้งเดียว |
| `/profile/notifications` | แสดง devices แต่ไม่มีปุ่ม enable | เพิ่ม Card "มือถือเครื่องนี้" + ปุ่ม register manual |
| Native push | NativeBridge auto-register แค่ครั้งแรก | + Manual re-register หลังจาก deny |
| App ล้าสมัย | ค้างหน้า cold start หรือพังเงียบ | Force-update screen + Store link |
| Deep link (`np.app/...`) | เปิด Safari/Chrome แทนแอป | เปิดแอปตรง (Universal Link / App Link) |
| Share video / link | `navigator.share` (มี/ไม่มีแล้วแต่ browser) | Native share-sheet ทุกแพลตฟอร์ม |
| `/local` GPS | ตัวแปร web อย่างเดียว | Capacitor Geolocation + Info.plist purpose |
| Rider GPS | เริ่ม online แล้วใช้ web GPS | Capacitor Geolocation + Background permission |
| External link | window.open ออก app | `@capacitor/browser` — เปิดใน app, ไม่หลุด |

---

## Next — Phase 17 (Store Compliance + Submission)

ดู `docs/roadmap.md` หัวข้อ Phase 17 (Apple Developer + Google Play
Console, Privacy Manifest, ATT consent screen, Account deletion endpoint,
demo account, screenshots, Beta testing flow)
