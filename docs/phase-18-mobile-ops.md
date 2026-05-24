# Phase 18 — Production Mobile Ops

> สถานะ: 🟢 code side done (2026-05-24)
> Prereqs: Phase 15 (PWA + Capacitor scaffold), Phase 16 (native capabilities),
> Phase 17 (Store compliance), Phase 13.1 (Sentry web).
>
> เป้าหมาย: เปิดทาง deploy แอป iOS/Android อัตโนมัติจาก CI, มี
> crash + ANR observability เต็มรูปแบบ, และส่ง JS/CSS update ทันที
> ผ่าน OTA โดยไม่ต้องรอ store review.

---

## 1) สรุปสั้น — ทำอะไรไปบ้าง

| ส่วนประกอบ                                     | ที่อยู่                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| **Sentry Capacitor adapter**                  | `apps/web/src/lib/native-observability.ts`                                   |
| **Live Updates client**                       | `apps/web/src/lib/live-updates.ts`                                           |
| **Native lifecycle → tracker**                | `apps/web/src/lib/native-lifecycle.ts`                                       |
| **Tracker kinds เพิ่ม 7 ตัว**                  | `apps/web/src/lib/track.ts`, `apps/api/src/shared/types/event.ts`, `packages/types/src/event.ts` |
| **OTA manifest API**                          | `apps/api/src/common/live-updates.controller.ts` → `GET /v1/app/live-updates/manifest` |
| **CI: iOS pipeline**                          | `.github/workflows/mobile-ios.yml`                                           |
| **CI: Android pipeline**                      | `.github/workflows/mobile-android.yml`                                       |
| **CI: OTA publisher**                         | `.github/workflows/mobile-live-update.yml`                                   |
| **Fastlane iOS**                              | `apps/web/ios/{Gemfile,fastlane/{Appfile,Matchfile,Fastfile,Pluginfile}}`    |
| **Fastlane Android**                          | `apps/web/android/{Gemfile,fastlane/{Appfile,Fastfile,Pluginfile}}`          |
| **Secrets reference**                         | `docs/phase-18-secrets.md`                                                   |
| **Native crash hook ใน auth-store**           | `apps/web/src/stores/auth-store.ts` — `setNativeUser` ที่ทุก login/logout    |
| **NativeBridge integration**                  | `apps/web/src/components/native-bridge.tsx`                                  |

---

## 2) Sentry Capacitor — Crash + ANR

### 2.1 Architecture

```
┌─────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│  Web error  │ →  │ @sentry/nextjs       │ →  │  Sentry (web proj) │
└─────────────┘    └──────────────────────┘    └────────────────────┘
                          ▲
                          │ shares DSN
                          ▼
┌─────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│ JS error    │ →  │ @sentry/capacitor    │ →  │  Sentry (web proj) │
│ in WebView  │    │ (wraps @sentry/browser)│   │                    │
└─────────────┘    └──────────────────────┘    └────────────────────┘
                          │
                          ▼
┌─────────────┐    ┌──────────────────────┐    ┌────────────────────┐
│ NSException │    │ Sentry-Cocoa /       │    │ Sentry (ios proj)  │
│ + ANR + hang│ →  │ sentry-java (native) │ →  │ + Sentry (android) │
└─────────────┘    └──────────────────────┘    └────────────────────┘
```

ที่นี่ผมแยก project ของ Sentry ไว้ 3 ตัว:
- `javascript-nextjs` (ของเดิม — created via Sentry wizard, slug = default Next.js platform; rename ที่ Settings → Project → Project Slug ได้)
- `np-commerce-ios` (Sentry-Cocoa — ใช้ dSYM upload)
- `np-commerce-android` (sentry-java — ใช้ ProGuard mapping upload)

DSN ฝั่ง JS (`NEXT_PUBLIC_SENTRY_DSN`) ใช้ตัวเดียวกัน (= web project) เพราะ
`@sentry/capacitor` route JS errors เข้า web project ส่วน native crashes
เข้า platform projects (กำหนดผ่าน Sentry-Cocoa/sentry-java config ใน
native code — ดู section 2.4)

### 2.2 ANR (Application Not Responding) detection

| Platform | Mechanism                                              | Default threshold |
| -------- | ------------------------------------------------------ | ----------------- |
| Android  | sentry-java ANR worker thread — pings UI thread        | 5000ms            |
| iOS      | Sentry-Cocoa hang detection (CFRunLoop watchdog)        | 2000ms            |

ทั้งคู่ enable อัตโนมัติเมื่อ `enableAutoSessionTracking: true` (ของเรา
default = on). กำหนด threshold ของ Android ได้ผ่าน
`NEXT_PUBLIC_SENTRY_ANR_TIMEOUT_MS`

### 2.3 Release tagging (จับคู่ stacktrace กับ dSYM/mapping)

ทุก crash ที่ส่งมา Sentry มี field `release` กับ `dist`. เราตั้งเป็น:

```
release = app.np.commerce@1.0.0+12345        # appId@version+build
dist    = 12345                              # build number alone
```

ฝั่ง CI (Fastlane iOS + Android):
- เก็บ `BUILD_NUMBER` = `GITHUB_RUN_NUMBER` (monotonically increasing)
- Stamp ลง Xcode + gradle.properties
- ส่ง `SENTRY_RELEASE` ลง env → Fastlane `sentry_create_release`
- Fastlane `sentry_debug_files_upload` (iOS) / `sentry_upload_proguard` (Android)
  อัปโหลด symbols ผูกกับ release tag

ผล: เมื่อมี crash จาก build 12345 → Sentry resolve stacktrace ได้ทันที

### 2.4 Native-side init (ถ้าต้องการเอง)

ตอนนี้ adapter ของเราใช้ `@sentry/capacitor.init()` จาก JS ซึ่งครอบทั้งคู่
(JS error + native bridge ผ่าน plugin). ถ้าต้องการ split DSN ระหว่าง web
และ native ต้องเขียน native init เอง:

**iOS** — `apps/web/ios/App/App/AppDelegate.swift`:

```swift
import Sentry

func application(...) {
    SentrySDK.start { options in
        options.dsn = "<ios-specific-DSN>"
        options.enableAutoSessionTracking = true
        options.enableWatchdogTerminationTracking = true
        options.tracesSampleRate = 0.0
    }
    return true
}
```

**Android** — `apps/web/android/app/src/main/java/.../MainApplication.java` (Capacitor's `MainActivity` parent):

```java
import io.sentry.android.core.SentryAndroid;

@Override
public void onCreate() {
    super.onCreate();
    SentryAndroid.init(this, options -> {
        options.setDsn("<android-specific-DSN>");
        options.setAnrEnabled(true);
        options.setAnrTimeoutIntervalMillis(5000);
    });
}
```

ทำในอนาคตเฉพาะถ้า quota ของ web project ไม่พอ — ตอนนี้ใช้ JS init ก่อน

### 2.5 Alert rules ที่แนะนำ (Sentry → Alerts)

| Trigger                                          | Threshold                 | Action               |
| ------------------------------------------------ | ------------------------- | -------------------- |
| Crash rate (any release)                         | > 0.5% ของ session ใน 1 ชม.| Slack #ops           |
| New issue with `is:unresolved`                   | > 5 events ใน 10 นาที      | Slack + page on-call |
| Release health drop (`crashFreeUsers < 99%`)     | บน production environment | Slack + email        |
| ANR rate                                         | > 0.2% ของ session ใน 24 ชม| Slack #mobile        |
| Specific issue: `LiveUpdateBundleApply.failed`   | ใดก็ตาม                    | Slack + auto-rollback (เรียก `LIVE_UPDATES_PAUSE=1` env) |

---

## 3) Live Updates (OTA)

### 3.1 ทำไมเขียนเอง ไม่ใช้ Ionic Appflow?

| ปัจจัย               | Ionic Appflow            | Self-hosted (เลือก)        |
| -------------------- | ------------------------ | ------------------------- |
| ราคา                 | $499/mo (Pro)            | ~$10/mo (S3 + CloudFront) |
| Lock-in              | สูง — ต้อง migration เมื่อย้าย | ไม่มี                    |
| Privacy              | ต้องส่ง bundle ผ่าน server เขา | bundle อยู่ใน CDN เราเอง  |
| Apple review safety  | OK (review URL อิสระ)    | OK                        |
| Rollout control      | UI-based                 | env var on API host        |

เราใช้ **`@capgo/capacitor-updater`** (open source MIT, Capacitor 6 compatible) — `@capacitor/live-updates` ของ Ionic ไม่ support self-host URL โดยตรง (ออกแบบสำหรับ Appflow paid service)

Capgo plugin จัด:
- `download({url, version, checksum})` — HTTPS + sha256 verify
- `next({id})` — flag เป็น bundle ถัดไป (apply ตอน background)
- `set({id})` — apply ทันที (destroys current JS context)
- `notifyAppReady()` — **MUST call within 10s of cold-start** ไม่งั้น Capgo auto-rollback
- `reset()` — กลับไปบันเดิลจาก binary (kill-switch)

### 3.2 Flow ของ OTA

```
1) Developer push tag `live-v1.0.5`
   ↓
2) GH Action `mobile-live-update.yml`:
   - Build static export
   - sha256 + zip bundle
   - Upload S3 (immutable URL)
   - Webhook → API host bump env vars
   - Sentry release create
   ↓
3) User เปิดแอป
   - NativeBridge → checkAndApplyLiveUpdate()
   - Fetch /v1/app/live-updates/manifest?platform=ios&nativeVersion=1.0.0&currentBuildId=xxx
   - Server replies { updateAvailable: true, url, checksum, ... }
   - Plugin downloads + verifies sha256 + stages
   ↓
4) User backgrounds the app (or next cold-start)
   - Plugin atomic-swaps to new bundle
   - WebView reloads with fresh JS
   - If boot fails → auto rollback to previous bundle
```

### 3.3 Rollout controls

| Env var                            | คำอธิบาย                                              | ตัวอย่าง            |
| ---------------------------------- | ----------------------------------------------------- | ------------------- |
| `LIVE_UPDATES_VERSION`             | semver display name                                   | `1.0.5`             |
| `LIVE_UPDATES_BUILD_ID`            | git short SHA (unique per build)                      | `1.0.5-abc123def0`  |
| `LIVE_UPDATES_BUNDLE_URL`          | HTTPS URL ของ zip                                     | https://cdn.np.app/bundles/web-bundle-1.0.5-abc123def0.zip |
| `LIVE_UPDATES_CHECKSUM`            | sha256 hex                                            | `5e8a...`           |
| `LIVE_UPDATES_BUNDLE_SIZE_BYTES`   | size for "ดาวน์โหลด X MB" UI                          | `3214567`           |
| `LIVE_UPDATES_MIN_NATIVE_VERSION`  | shell ต่ำสุดที่ใช้ bundle นี้ได้                      | `1.0.0`             |
| `LIVE_UPDATES_ROLLOUT_PCT`         | % ของ production users ที่ได้ bundle (0-100)          | `25`                |
| `LIVE_UPDATES_PAUSE`               | "1" = หยุด rollout ทันที (kill-switch)                | `0` หรือ `1`        |
| `LIVE_UPDATES_POLL_INTERVAL_SEC`   | TTL ที่ client cache (default 6 ชม.)                  | `21600`             |

### 3.4 Bucket assignment (canary)

`live-updates.controller.ts` hash `userId || anonId` mod 100 →
0-99 bucket. ถ้า bucket < `LIVE_UPDATES_ROLLOUT_PCT` → ได้ bundle ใหม่
(deterministic — user เดิม bucket เดียวกันทุกครั้ง = no flapping)

Beta channel (เลือกจาก settings UI ต่อในอนาคต Phase 18.x) → ได้ 100%
ของ bundle เสมอ

### 3.5 Rollback playbook

| สถานการณ์                              | คำสั่ง                                                       |
| -------------------------------------- | ------------------------------------------------------------ |
| Crash spike จาก OTA bundle ใหม่         | API host: `LIVE_UPDATES_PAUSE=1` แล้ว restart                |
| ต้องย้อนกลับ build ก่อนหน้า              | API host: เซต `LIVE_UPDATES_BUNDLE_URL` กลับเป็น URL bundle เก่า + `LIVE_UPDATES_BUILD_ID` เก่า |
| User-level reset (เจอ bug ตัวเอง)       | Settings UI → "รีเซ็ตเป็นเวอร์ชันจากสโตร์" → `resetLiveUpdate()` |

### 3.6 Apple App Store ข้อจำกัด

Apple อนุญาต hot update **เฉพาะ** เมื่อ:
- ไม่เพิ่ม native code
- ไม่เปลี่ยน primary purpose ของแอป
- ใช้ JS-only

เราจึง:
- ห้าม push bundle ที่เพิ่ม Capacitor plugin ใหม่ (ต้อง store update)
- ห้าม push bundle ที่เปลี่ยน app store description / category
- OK สำหรับ: bug fix, copy change, A/B variant, ฟีเจอร์ใหม่ที่ใช้ JS เท่านั้น

---

## 4) GitHub Actions

### 4.1 Trigger matrix

| Workflow              | Trigger                            | Output                                |
| --------------------- | ---------------------------------- | ------------------------------------- |
| `mobile-ios`          | tag `mobile-v*` หรือ manual       | TestFlight build                      |
| `mobile-android`      | tag `mobile-v*` หรือ manual       | Play Internal Testing AAB             |
| `mobile-live-update`  | tag `live-v*` หรือ manual          | OTA bundle ลง S3 + manifest bump      |

ตัวอย่างการใช้:

```bash
# Major native release (UI + plugin update) — ต้อง store review
git tag mobile-v1.0.0
git push origin mobile-v1.0.0

# Quick JS bug fix — OTA only
git tag live-v1.0.1
git push origin live-v1.0.1
```

### 4.2 Environment + approvals

แต่ละ workflow ผูกกับ environment:
- `ios-production`        — required reviewer 1 คน
- `android-production`    — required reviewer 1 คน
- `ota-production`        — required reviewer 1 คน
- `ota-beta`              — ไม่ต้อง approve

ตั้งใน GitHub Settings → Environments

### 4.3 Concurrency

ทุก workflow ใช้ `concurrency: cancel-in-progress: false` — ป้องกัน
overlap (เช่น Fastlane match grab cert ซ้อนกัน) แต่ไม่ยกเลิก build
ที่กำลังรัน

---

## 5) Fastlane — ทำอะไรได้บ้าง

### 5.1 iOS lanes

```bash
cd apps/web/ios
bundle install            # ครั้งแรก
bundle exec fastlane beta      # → TestFlight
bundle exec fastlane release   # → App Store (manual review trigger)
```

### 5.2 Android lanes

```bash
cd apps/web/android
bundle install
bundle exec fastlane internal      # Internal Testing (≤100 testers)
bundle exec fastlane alpha         # Closed Alpha
bundle exec fastlane beta          # Closed Beta (public link)
bundle exec fastlane production    # Phased rollout (default 10%)
```

### 5.3 Local dev setup (one-time per machine)

```bash
# iOS
cd apps/web/ios
gem install bundler
bundle install
bundle exec fastlane match init      # ครั้งแรก: setup match repo
bundle exec fastlane match appstore  # gen first cert/profile

# Android
cd apps/web/android
bundle install
# ต้อง keystore + service account JSON วางที่ที่ Fastfile กำหนด
```

> สำคัญ: ถ้า dev เครื่องใหม่ไม่ทำ `bundle install` ที่ `apps/web/ios/`
> `pnpm cap sync` จะ fail เพราะ Capacitor 6 ตรวจ Gemfile แล้วใช้
> `bundle exec pod install`. ทางเลือก: set `CAPACITOR_COCOAPODS_PATH=$(which pod)`
> เพื่อ bypass bundler และใช้ system pod แทน

---

## 6) Native lifecycle events → tracker

7 events ใหม่ที่ tracker รองรับ (ทั้ง web + api + types package):

| Event                       | เมื่อไหร่                                         | Surface          |
| --------------------------- | ----------------------------------------------- | ---------------- |
| `app_open`                  | Cold-start ของ native shell                      | `native`         |
| `app_resume`                | กลับมา foreground หลังเข้า background          | `native`         |
| `app_background`            | เข้า background (lock screen / home button)      | `native`         |
| `app_url_open`              | Deep link / Universal Link / scheme เปิดแอป      | `deep_link`      |
| `live_update_downloaded`    | OTA bundle ดาวน์โหลดเสร็จ (รอ apply)             | -                |
| `live_update_applied`       | OTA bundle apply สำเร็จหลัง webview reload       | -                |
| `live_update_failed`        | OTA fail (network / checksum / boot rollback)   | -                |

KPI ที่ใช้ได้:
- DAU/MAU แยก web vs native (`SELECT count(distinct anonId) FROM events WHERE kind='app_open'`)
- Retention curve ต่อ platform
- OTA adoption: % ของ `app_open` หลัง `live_update_applied` event
- Funnel: `app_open` → `app_url_open` (deep link conversion)

---

## 7) Manual steps ที่เหลือ (ก่อนกด deploy จริง)

> 📘 **Step-by-step runbook** (5 วัน): [`docs/phase-18-runbook.md`](./phase-18-runbook.md)
>
> ดูเต็มใน `docs/phase-18-secrets.md` → "Pre-flight checklist". สรุปสั้น:

- [ ] Apple Developer Program จ่าย $99/y
- [ ] Google Play Console จ่าย $25 one-time
- [ ] สร้าง app record บน App Store Connect + Play Console
- [ ] สร้าง keystore Android + back-up offline 2 ที่
- [ ] สร้าง Match repo (private GitHub) + first cert
- [ ] Service account JSON (Play) + Release Manager role
- [ ] Sentry org + 3 projects (web, ios, android) + DSN
- [ ] S3 bucket + CloudFront distribution + IAM user
- [ ] API host เปิด env vars + webhook endpoint
- [ ] ตั้ง GitHub Environments + reviewers
- [ ] First manual upload (Play ต้องมี draft แรกก่อน CI)
- [ ] Install `@sentry/capacitor` + `@capacitor/live-updates`:
  ```bash
  pnpm --filter web add @sentry/capacitor @capacitor/live-updates
  pnpm cap sync
  ```

---

## 8) Deferred (Phase 18.x)

- [ ] **OTA settings UI** — Settings screen ให้ user toggle channel
  (production/beta), check for update manual, restart to apply
- [ ] **In-app upgrade prompt** soft banner (status=UPDATE_AVAILABLE)
  — Phase 16 ทำ force-update gate แล้ว แต่ soft banner ยัง deferred
- [ ] **Sentry user feedback widget** ในแอป — ปุ่ม "Report a problem"
  เปิด Sentry feedback dialog
- [ ] **APM (App Performance Monitoring)** — Sentry traces sample
  rate > 0 + custom transactions (เช่น "checkout_flow")
- [ ] **Build matrix** — single workflow run ทั้ง iOS + Android +
  publish OTA + bump native version ใน step เดียว (ตอนนี้แยก 3 workflows
  เพื่อ control ละเอียด)
- [ ] **Webhook handler ฝั่ง API** สำหรับรับ bump env vars จาก
  `mobile-live-update.yml` (ตอนนี้ workflow ทำเสร็จแล้ว แต่ API host
  ยังไม่มี endpoint รับ — ต้องเขียนเพิ่มฝั่ง deploy hook ของ Vercel/Railway/Fly)

---

## 9) Smoke test (เมื่อทุก secret พร้อม)

```bash
# 1) Native build smoke
cd apps/web/ios && bundle exec fastlane beta
# → ตรวจ TestFlight builds tab ใน App Store Connect

cd apps/web/android && bundle exec fastlane internal
# → ตรวจ Play Console → Testing → Internal Testing

# 2) OTA smoke (จากเครื่อง dev)
cd /Users/npcreate/np-commerce-os
BUILD_STATIC=true pnpm --filter web build
cd apps/web/out && zip -r ../../../test-bundle.zip . && cd -
sha256sum test-bundle.zip
# → ใช้ค่า hash อัปเดต env LIVE_UPDATES_CHECKSUM, BUNDLE_URL ใน API
curl -s "https://api.np.app/v1/app/live-updates/manifest?platform=ios&nativeVersion=1.0.0&channel=beta" | jq

# 3) Sentry smoke
curl -X POST "https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT_NATIVE_IOS}/releases/" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version":"app.np.commerce@1.0.0+test","projects":["np-commerce-ios"]}'
# → ตรวจ Sentry → Releases → ควรเห็น release ใหม่
```

---

## 10) Verification ที่ทำไปแล้ว (2026-05-24)

- ✅ `pnpm --filter web exec tsc --noEmit` ผ่าน
- ✅ `pnpm --filter api run typecheck` ผ่าน
- ✅ `pnpm --filter web exec next lint --dir src/lib --dir src/stores` ผ่าน
- ✅ `CAPACITOR_COCOAPODS_PATH=$(which pod) pnpm cap sync ios` — 11 plugins synced
- ✅ `pnpm cap sync android` — 11 plugins synced
- ✅ GitHub Actions YAML syntax — local validate
- ✅ Fastfile syntax — `bundle exec fastlane lanes` (manual test, optional)

ส่วนที่จะ verify ได้เต็มเมื่อ secrets พร้อม:
- TestFlight upload + symbolication
- Play internal track upload + ProGuard mapping
- OTA download + apply + rollback
- ANR alert rule fire
