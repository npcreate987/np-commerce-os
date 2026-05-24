# Phase 17 — Store Compliance + Submission

> สถานะ: 🟢 **code-side done** · 🟡 manual store steps pending
> วันที่: 2026-05-24
> เป้าหมาย: ขึ้น Closed Beta บน TestFlight + Internal Track ของ Play

Phase 17 จัดให้ทุกอย่าง **ฝั่ง code** ของ NP Commerce พร้อมส่ง store
review — Privacy Manifest, ATT prompt, account deletion endpoint,
public privacy/terms pages, demo seeder, store listing copy
สิ่งที่เหลือเป็น manual: จ่ายค่าสมัคร developer, สร้าง provisioning,
อัปสกรีนช็อต, กด Submit

---

## 1) iOS Privacy Manifest

ไฟล์: `apps/web/ios/App/App/PrivacyInfo.xcprivacy`

ประกาศ:

- `NSPrivacyTracking = false` (ไม่ติดตามข้าม app/web)
- **Required-reason APIs**:
  - `UserDefaults (CA92.1)` — Capacitor Preferences plugin
  - `FileTimestamp (C617.1)` — file upload metadata
  - `SystemBootTime (35F9.1)` — performance measurement
  - `DiskSpace (E174.1)` — low-space warning
  - `ActiveKeyboards (54BD.1)` — WebView text input
- **Data types collected** (mapped to App Store nutrition labels):
  - Email, Phone, Name, UserID, DeviceID (linked to identity)
  - CoarseLocation, PreciseLocation (linked)
  - PhotosorVideos, OtherUserContent (linked)
  - ProductInteraction (linked, after ATT opt-in)
  - CrashData, PerformanceData (not linked — Sentry)

Xcode pick up อัตโนมัติเมื่ออยู่ใต้ `App/App/` — verified โดย
`pnpm cap sync` ไม่แตะไฟล์ที่อยู่ใน `App/` (เฉพาะ `App/public/`)

---

## 2) App Tracking Transparency (ATT)

iOS บังคับให้ขอ permission ก่อนแสดง personalized recommendations
หรือใช้ identifier ใด ๆ ข้าม domain

ไฟล์:

- `apps/web/src/lib/native.ts` → `getATTStatus()`, `requestATTPermission()`
- `apps/web/src/components/att-consent-gate.tsx` — pre-prompt sheet
- Mount ผ่าน `NativeBridge` (จาก Phase 15) → กับทุก customer route

Flow:

1. App boot บน iOS → check `getATTStatus()`
2. ถ้า `notDetermined` + ไม่เคย soft-decline → แสดง pre-prompt ของเรา
3. ผู้ใช้กด **"อนุญาต"** → ทริกเกอร์ Apple dialog → ตอบ Allow/Deny
4. กด **"ไม่ตอนนี้"** → soft-decline, ไม่แสดง Apple prompt
5. ผลลัพธ์ → mirror ลง `tracker.setConsent()` → ตัดวงจรเก็บ event ทันที

**Plugin dependency** (optional, ติดตั้งเมื่อพร้อมเปิดใช้):

```bash
pnpm --filter web add @capacitor-community/app-tracking-transparency
pnpm --filter web exec cap sync
```

ถ้าไม่ติดตั้ง → ฟังก์ชันจะคืน `'unsupported'` และเราถือว่า user
declined (privacy-first default) → ไม่ต้องแก้โค้ดอื่นเลย

---

## 3) Account Deletion (Google + Apple required)

### Schema migration

`20260524004659_phase17_account_deletion/` เพิ่มคอลัมน์ใน `users`:

- `deletionRequestedAt DATETIME NULL`
- `deletionPurgeAt DATETIME NULL`
- `deletionReason TEXT NULL`
- index `(deletionPurgeAt)` สำหรับ sweeper

### Service + endpoints

ไฟล์:

- `apps/api/src/modules/user/account-deletion.service.ts`
- `apps/api/src/modules/user/account-deletion.controller.ts`

Endpoints (ทุกตัวต้อง JWT):

| Method | Path | Action |
| --- | --- | --- |
| GET | `/v1/me/account/deletion` | คืน `{ pending, requestedAt, purgeAt, graceDays }` |
| DELETE | `/v1/me/account` | เริ่ม grace 30 วัน + revoke refresh tokens |
| POST | `/v1/me/account/deletion/cancel` | ยกเลิก grace, คืนสถานะ |

### Login block

`auth.service.ts` เพิ่ม check — ถ้า `user.deletionRequestedAt` →
โยน `UnauthorizedException` พร้อม code `ACCOUNT_DELETION_PENDING` +
`purgeAt` เพื่อให้ client แสดง UI ฟื้นบัญชี

### Sweeper

`AccountDeletionService.onApplicationBootstrap()` รัน `setInterval`
ทุก 6 ชั่วโมง → query users ที่ `deletionPurgeAt <= NOW` →
`prisma.user.delete()` (cascade ลบ shops/carts/orders/addresses)

Stagger initial run 90s หลัง boot เพื่อไม่ชนกับ retention sweeper

### UI

`apps/web/src/app/(customer)/profile/privacy/page.tsx` เพิ่ม
`<AccountDeletionCard>` ครอบ flow ทั้งหมด:

- ปุ่ม "ขอลบบัญชี" → confirm sheet พร้อม reason textarea
- ถ้า pending → แสดง countdown + ปุ่ม "ยกเลิก เก็บบัญชีไว้"
- หลังขอลบสำเร็จ → 3 วินาที auto-logout + redirect ออก

Reachable จาก `/profile → "ความเป็นส่วนตัว" → "ลบบัญชี"` — 2 taps
ตามที่ Google Play 2023 บังคับ

---

## 4) Privacy Policy + Terms of Service (public)

ไฟล์:

- `apps/web/src/app/legal/privacy/page.tsx` → URL `/legal/privacy`
- `apps/web/src/app/legal/terms/page.tsx` → URL `/legal/terms`

ทั้งสองหน้า:

- Public (ไม่ต้อง login)
- Server component (ไม่มี `'use client'`) → ไม่มี hydration issue
  สำหรับ Apple/Google crawler
- คำไทยล้วน + เลขเวอร์ชัน 1.0 (24 พ.ค. 2026)
- ลิงก์ระหว่างกันใน footer

ใช้ใน store listings:

- Apple App Store Connect → App Information → Privacy Policy URL
- Play Console → App content → Privacy Policy
- Footer ของ `apps/web/src/app/page.tsx` (TODO Phase 17.x: เพิ่มลิงก์)

---

## 5) Demo Account Seeder

ไฟล์: `apps/api/prisma/seed-reviewer.ts`

ใช้ผ่าน:

```bash
pnpm --filter api seed:reviewer
```

Default credentials (override ผ่าน env):

- email: `reviewer@np.app` (env `REVIEWER_EMAIL`)
- password: `NPReview2026!` (env `REVIEWER_PASSWORD`)

Idempotent — รันซ้ำได้ ไม่สร้าง dup, ล้าง `deletionRequestedAt`
ถ้า reviewer ลองทดสอบ deletion ในรอบก่อนหน้า

เริ่มต้น cart มี item 1 ชิ้น (จาก demo shop) ให้ Apple/Google
ทดสอบ checkout ได้ทันทีโดยไม่ต้องเข้าหน้าสินค้า

---

## 6) Store Listing Assets

โครงสร้าง:

```
docs/store-listing/
├── README.md
├── apple/{metadata,review-info,screenshots}.md
├── google/{metadata,data-safety,screenshots}.md
└── shared/icon.md
```

ครอบครุม:

- App name, subtitle, promotional text, full description (TH + EN)
- Keywords, category, age rating
- Demo account info + review notes (4000 char) ที่ส่ง Apple
- Data Safety form ที่กรอกใน Play Console (มี table mapping ทุก
  data type)
- Screenshot specs + storage convention
- Icon design constraints

---

## 7) Submission Checklist

### Pre-flight (one-time)

- [ ] **Apple Developer Program** ($99/y) — สมัครใน
      [developer.apple.com](https://developer.apple.com/programs)
- [ ] **Google Play Console** ($25 one-time) — สมัครใน
      [play.google.com/console](https://play.google.com/console/signup)
- [ ] **Bundle ID + Provisioning Profile** (Apple) —
      `app.np.commerce` ใน App Store Connect → Identifiers
- [ ] **Push key (.p8)** — สร้าง APNs Auth Key (ใช้กับทุก app ของ
      team) → Apple Developer → Keys → "+" → Apple Push Notifications
- [ ] **Play App Signing key** (Google) — Generate ใน Console เพื่อ
      ให้ Google เก็บ private key (recommended) → SHA-256 fingerprint
      ไปใส่ใน `.well-known/assetlinks.json`

### Per-release

- [ ] **Bump version** `apps/web/ios/App/App.xcodeproj/project.pbxproj`
      → `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`
- [ ] **Bump version** `apps/web/android/app/build.gradle` →
      `versionCode` + `versionName`
- [ ] **Update `APP_LATEST_VERSION` + `APP_MIN_SUPPORTED`** ใน API
      environment ก่อน force-update gate ทำงาน (Phase 16)
- [ ] **Re-seed reviewer** ใน production DB:
      `pnpm --filter api seed:reviewer`
- [ ] **Archive iOS** → Xcode → Product → Archive → Upload to App
      Store
- [ ] **Build AAB** Android → `./gradlew bundleRelease` → upload to
      Play Console
- [ ] **Update screenshots** ถ้า UI เปลี่ยน
- [ ] **Update copy** ถ้า feature ใหม่ใน
      `docs/store-listing/{apple,google}/metadata.md`
- [ ] **Submit for review** → ดู timeline:
      Apple ~24-48h · Google ~1-7d

### Post-launch

- [ ] **Phased rollout** — Apple 1-day → 2-day → 5-day → 100% ·
      Google 1% → 5% → 10% → 100%
- [ ] **Monitor Sentry + crash dashboard** ทุก 6 ชั่วโมง
- [ ] **Reply to first 25 reviews** ภายใน 48 ชม. (Apple algo
      counts response rate)

---

## 8) Known limitations / Deferred to Phase 17.x

- **Order anonymization** instead of hard-delete (Thai e-Tax 5y
  retention) → ตอนนี้ cascade ลบหมด; ทำ Phase 17.x หลังจาก wallet/
  invoice ship
- **`@capacitor-community/app-tracking-transparency`** ยังไม่ install
  → adapter `getATTStatus()` คืน `'unsupported'` ชั่วคราว → ATT gate
  ไม่ปรากฏใน iOS production จนกว่าจะ install + cap sync
- **Sign in with Apple** — Apple บังคับใส่ถ้ามี social login อื่น แต่
  เราใช้ email/OTP เท่านั้น (Phase 9.x) → ไม่ต้องเพิ่มจน Phase
  18.x ที่จะเพิ่ม Google/LINE login
- **Privacy Manifest crawler** ของ Apple — บางครั้ง false-positive
  เรื่อง 3rd-party SDK; ดู `pod install` log ของแต่ละ Capacitor
  plugin ว่ามี privacy manifest มาด้วยไหม (Capacitor 6 มีแล้ว)
- **Footer links** — ยังต้อง add `<Link href="/legal/privacy">` ใน
  หน้า landing + checkout (Phase 17.x — quick PR)

---

## 9) Verification

```
$ pnpm --filter web typecheck            # ✔
$ pnpm --filter api exec tsc --noEmit    # ✔ (no new errors)
$ pnpm --filter web exec cap sync        # ✔ 11 plugins
$ ls apps/web/ios/App/App/PrivacyInfo.xcprivacy
                                          # ✔ present
$ pnpm --filter api seed:reviewer        # ✔ reviewer@np.app provisioned
```

---

## Next — Phase 18 (Production Mobile Ops)

ดู `docs/roadmap.md` หัวข้อ Phase 18 (GitHub Actions + Fastlane,
Sentry mobile SDK, OTA Live Updates, Crash + ANR monitoring)
