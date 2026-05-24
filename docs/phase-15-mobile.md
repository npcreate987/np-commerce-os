# Phase 15 — Mobile Native Shell (Capacitor)

> เป้าหมาย: ทำให้ NP Commerce รันเป็นแอปจริงบน iOS + Android โดยไม่เขียน UI ใหม่
> Strategy: **Capacitor 6 wrap PWA** (static bundle) + native plugins สำหรับ push / camera / geo / preferences
>
> สถานะ: Phase 15 — Foundation ✅ done (2026-05-24)

---

## สรุปสิ่งที่ทำในเฟสนี้

### 15.1 Capacitor configuration
- `apps/web/capacitor.config.ts` ปรับเป็น production-ready
  - `loggingBehavior: 'none'` ใน prod (default `debug`)
  - `allowMixedContent` ถูก gate ด้วย `NODE_ENV` (ปิดเมื่อ prod)
  - `server.allowNavigation` whitelist `np.app`, `*.np.app`, `api.np.app`
  - URL scheme `NPCommerce://` สำหรับ iOS deep links
  - SplashScreen + StatusBar + PushNotifications + App + Preferences + Camera +
    Geolocation plugins ถูก register ตาม Capacitor 6

### 15.2 Native shell projects
- ✅ `apps/web/ios/` — Xcode project + CocoaPods (`pod install` แล้ว)
- ✅ `apps/web/android/` — Gradle project พร้อม manifest
- ✅ Plugin sync ผ่าน `pnpm cap:sync` (11 plugins ทั้งสองแพลตฟอร์ม)

### 15.3 Brand asset pipeline
- `apps/web/resources/logo.svg` + `splash.svg` (vector source, แทนได้)
- `apps/web/scripts/build-mobile-assets.mjs` — `sharp` รัน SVG → PNG
- `pnpm assets:render` → 2 base + 6 PWA icons
- `pnpm assets:generate` → `@capacitor/assets` กระจาย 87 Android + 10 iOS sizes
- `pnpm assets:build` รวมทั้งสองในคำสั่งเดียว

### 15.4 Native bridge code
- `apps/web/src/lib/native.ts`
  - `isNative()` / `getPlatform()`  — synchronous Capacitor detection
  - `safeStorage` — Preferences plugin บน native, localStorage บน web
  - `registerNativePush(token)` — APNs/FCM token → existing `/v1/notifications/devices`
  - `hideNativeSplash()` — hide splash หลัง React hydrate
  - `wireDeepLinks(push)` — `App.addListener('appUrlOpen', …)` → router.push
- `apps/web/src/components/native-bridge.tsx` — top-level provider
  ที่ wire ทั้งหมดเข้าด้วยกัน mount ใน `CustomerShell`
- `apps/web/src/lib/env.ts` — `apiUrl` resolver ตรวจ `isCapacitorNative()` →
  ใช้ `NEXT_PUBLIC_API_URL` ตรง ๆ (WebView ของ Capacitor ใช้ localhost)

### 15.5 PWA / Deep link manifest
- `apps/web/public/manifest.json`
  - เพิ่ม `id`, `shortcuts` (4 ทางลัด: ฟีด/ตะกร้า/ออเดอร์/ใกล้ฉัน)
  - `share_target` รับ share จากแอปอื่นเข้า `/feed/create`
  - `related_applications` ลิงก์ Play + App Store IDs
- `apps/web/public/.well-known/apple-app-site-association` — Universal Links template
- `apps/web/public/.well-known/assetlinks.json` — Android App Links template
- `next.config.mjs` ส่ง `Content-Type: application/json` ให้ทั้ง 2 ไฟล์

### 15.6 Repo hygiene
- `.gitignore` — commit `ios/` + `android/` แต่ ignore Pods/build/.gradle/Keystores
- `pnpm-lock.yaml` ตรวจ ✅ (10 capacitor packages + sharp + @capacitor/assets)

---

## โครงสร้างที่ได้

```
apps/web/
├── capacitor.config.ts        ← prod-ready
├── resources/                  ← NEW
│   ├── logo.svg                  master vector
│   ├── splash.svg
│   ├── icon.png                  1024 (auto-generated)
│   └── splash.png                2732 (auto-generated)
├── scripts/                    ← NEW
│   └── build-mobile-assets.mjs
├── public/
│   ├── manifest.json           ← enriched
│   ├── icons/                  ← 9 sizes (auto-generated)
│   └── .well-known/            ← NEW
│       ├── apple-app-site-association
│       └── assetlinks.json
├── src/
│   ├── lib/
│   │   ├── native.ts           ← NEW (bridge)
│   │   └── env.ts              ← updated (Capacitor-aware)
│   └── components/
│       ├── native-bridge.tsx   ← NEW
│       └── shell/customer-shell.tsx  ← wires <NativeBridge>
├── ios/                        ← NEW (Xcode project, committed)
│   └── App/
│       ├── App.xcodeproj
│       ├── App.xcworkspace
│       ├── Podfile
│       └── App/Assets.xcassets ← 10 icon/splash sizes
└── android/                    ← NEW (Gradle project, committed)
    ├── app/build.gradle
    └── app/src/main/res/       ← 87 icon/splash sizes
```

---

## วิธีรันบน Simulator / Device

### iOS

#### Prerequisites
```bash
xcode-select --install
brew install cocoapods       # ทำแล้ว ✅
```

#### Dev mode (live reload จาก dev server บน LAN)
```bash
# Terminal 1 — API
cd apps/api && pnpm dev

# Terminal 2 — Web (bind 0.0.0.0 ให้มือถือเข้าได้)
cd apps/web && WEB_HOST=0.0.0.0 pnpm dev

# Terminal 3 — Capacitor live-reload (iOS simulator)
cd apps/web
CAP_SERVER_URL=http://$(ipconfig getifaddr en0):3000 pnpm cap:dev:ios
```

#### Production build (จะ upload TestFlight)
```bash
cd apps/web
BUILD_STATIC=true pnpm build      # → apps/web/out/
pnpm cap:sync                     # copy out/ → ios/App/App/public/
pnpm cap:open:ios                 # เปิด Xcode
# Xcode: เลือก scheme "App" + device → Product → Archive → Distribute → TestFlight
```

### Android

#### Prerequisites
```bash
brew install --cask android-studio
brew install openjdk@17
# Android Studio: ติดตั้ง Android SDK 34 + Build Tools 34 + Platform Tools
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

#### Dev mode
```bash
# (เหมือน iOS terminal 1+2)
cd apps/web
CAP_SERVER_URL=http://$(ipconfig getifaddr en0):3000 pnpm cap:dev:android
```

#### Production build
```bash
cd apps/web
BUILD_STATIC=true pnpm build
pnpm cap:sync
pnpm cap:open:android             # เปิด Android Studio
# Build → Generate Signed Bundle → Android App Bundle (.aab) → Upload Play Console
```

---

## วิธีเปลี่ยน Logo / Splash

1. แทน `apps/web/resources/logo.svg` (1:1, สี brand pink `#FF3E5C`)
2. แทน `apps/web/resources/splash.svg` (1:1, logo อยู่ตรงกลาง ~30% เผื่อ safe-area)
3. รัน
   ```bash
   cd apps/web
   pnpm assets:build   # render + generate ทุก resolution + sync เข้า ios/android
   ```
4. รัน `pnpm cap:sync` อีกครั้งเพื่อ commit เข้า native projects

---

## Decision points (ที่ตอบใน Phase 15)

| คำถาม | คำตอบ | ผลกระทบ |
|---|---|---|
| Hosting | Static bundle (`BUILD_STATIC=true`) | offline-first, ทุก update ผ่าน store review · ใช้ Capacitor Live Updates ใน Phase 18 |
| Auth | Email/Password + OTP เบอร์โทรเดิม | ไม่มี Sign in with Apple (ยังไม่ trigger Apple rule) · เพิ่มภายหลังได้ |
| Payment | Physical commerce only (Omise/PromptPay/SCB) | ไม่ติด Apple IAP rule · ถ้าจะเพิ่ม digital/subscription ต้องเพิ่ม IAP |
| Scope | Full Phase 15 ครบ | scaffold + asset pipeline + bridge + manifest + docs |

---

## Phase ถัดไป

### Phase 16 — Native Capabilities Wiring
ปลดล็อก native API ทีละชิ้น (push, camera, geo, deep links) — adapter ฝั่ง API
มีพร้อมจาก Phase 9.1 + 10.1 อยู่แล้ว:
- [ ] Native push registration UI ใน `/profile/notifications`
- [ ] Replace browser camera (composer) → Capacitor Camera plugin
- [ ] Geolocation บน `/local` — replace `navigator.geolocation` กับ plugin
- [ ] Universal Links / App Links wiring + Associated Domains capability
- [ ] Migration localStorage → Preferences plugin สำหรับ refresh token
- [ ] App version sync (เปรียบเทียบ build vs API minVersion → force update screen)

### Phase 17 — Store Compliance + Submission
- [ ] Apple Developer / Google Play Console accounts
- [ ] Bundle ID + provisioning profile + signing key
- [ ] Screenshots + listing copy + privacy questionnaire
- [ ] Internal Testing → Closed Beta → Production rollout
- [ ] Account deletion endpoint (Google requires) + Apple privacy nutrition label

### Phase 18 — Production Ops
- [ ] GitHub Actions + Fastlane CI/CD (build + sign + upload)
- [ ] Sentry mobile SDK + symbol upload
- [ ] Capacitor Live Updates (OTA สำหรับ JS/CSS เปลี่ยนโดยไม่ต้อง re-submit)
- [ ] Crash + performance monitoring

---

## Smoke (live)

```
✓ pnpm install                  ← 1280 packages including 10 Capacitor plugins
✓ pnpm assets:render            ← 2 base PNG + 6 PWA icons (logo.svg → sharp → PNG)
✓ pnpm cap:add:ios              ← Xcode project created at apps/web/ios/
✓ pnpm cap:add:android          ← Gradle project at apps/web/android/
✓ pnpm assets:generate          ← 87 Android + 10 iOS sizes (CREATE messages all clean)
✓ pnpm cap:sync                 ← 11 plugins detected · pod install 3.95s
✓ pnpm typecheck                ← clean (no new errors)
✓ ReadLints                     ← no linter errors on new files
```

ผลตอนนี้: ทุกอย่างพร้อมที่จะรัน
```bash
pnpm cap:open:ios     # เปิด Xcode → Cmd-R รัน simulator
pnpm cap:open:android # เปิด Android Studio → กด Run
```

ตอนเปิด simulator จะเห็น stub `out/index.html` ก่อน เพราะยังไม่ได้
`BUILD_STATIC=true pnpm build` — สั่ง build ก่อนแล้วค่อย `pnpm cap:sync`
อีกครั้งจะเห็น app จริงทุกหน้า

---

## Troubleshooting

**`Input buffer contains unsupported image format` ระหว่าง `pnpm assets:render`**
- เกิดเมื่อ SVG file มี non-ASCII chars ใน comment (เช่น Thai)
- แก้: เก็บ comment ของ SVG เป็น English เท่านั้น

**`pod install` ค้างหลัง `cap:add:ios`**
- ครั้งแรก CocoaPods ต้อง sync repo (~10 นาที)
- ถ้าค้างให้รัน `pod repo update` แยก แล้วลอง `pnpm cap:sync` ใหม่

**Android Studio build ติด `JAVA_HOME`**
- `brew install openjdk@17` + `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`
- เพิ่มลง `~/.zshrc`

**Bundle ID conflict (cannot use 'app.np.commerce')**
- เปลี่ยน `appId` ใน `apps/web/capacitor.config.ts` + Xcode signing settings
- รัน `pnpm cap:sync` หลังเปลี่ยน

**iOS Simulator แสดงหน้าจอขาว**
- เช็คว่า `out/index.html` มีอยู่: `ls apps/web/out/`
- ถ้าไม่มีรัน `BUILD_STATIC=true pnpm build` แล้ว `pnpm cap:sync`

**ลิงก์ `https://np.app/order/123` ไม่เปิดในแอป**
- Apple AASA validator: https://branch.io/resources/aasa-validator/
- Google App Links: https://developers.google.com/digital-asset-links/tools/generator
- ใส่ Team ID จริงใน `apple-app-site-association` + signing SHA-256 ใน `assetlinks.json`
