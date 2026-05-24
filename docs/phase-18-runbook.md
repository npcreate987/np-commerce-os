# Phase 18 — Runbook: ลำดับการทำงาน Step-by-Step

> เริ่มจาก Phase 18 code-side พร้อมแล้ว (ดู `docs/phase-18-mobile-ops.md`).
> runbook นี้คือ checklist ละเอียดสำหรับ "เปิดบัญชี → upload จริง → submit review"
>
> เป้าหมาย: 5 วันทำการ (1 สัปดาห์) ถึง Closed Beta บน TestFlight + Play Internal
> · 2-3 สัปดาห์ถึง Production rollout 100%
>
> ทำตามลำดับ — ทุก section pre-requisite ของ section ถัดไป

---

## Day 0 — Free prep (ทำได้ทันที, ไม่ต้องจ่ายเงิน) ⏱ 30-60 นาที

### 0.1 Install Capacitor + Sentry plugins (5 นาที)

```bash
cd /Users/npcreate/np-commerce-os
# Sentry — pin version ให้ตรงกับ @sentry/capacitor peer dep
# (Sentry v10 ใช้ single-version policy — แตกต่าง = peer warning)
pnpm --filter web add @sentry/capacitor@4 @capgo/capacitor-updater@6
pnpm install
```

ตรวจ + sync:

```bash
pnpm --filter web exec tsc --noEmit
CAPACITOR_COCOAPODS_PATH=$(which pod) pnpm --filter web exec cap sync
```

ที่ควรเห็น: `Found 13 Capacitor plugins for ios` + `... for android`
(เพิ่มจาก 11: `@capgo/capacitor-updater@6.45.10` + `@sentry/capacitor@4.0.0`)

> **หมายเหตุ**: เปลี่ยน plugin จาก `@capacitor/live-updates` (Ionic Appflow proprietary)
> เป็น `@capgo/capacitor-updater` (MIT, self-host URL-friendly).
> `pnpm.overrides` ใน root `package.json` pin `@sentry/{react,browser,core,types}: 10.43.0`
> ให้ตรงกับ `@sentry/capacitor 4.0.0` peer (Sentry v10 single-version policy)
>
> **iOS deployment target**: bump เป็น `15.0` (Sentry Capacitor 4 requirement).
> แก้ใน `apps/web/ios/App/Podfile` + `App.xcodeproj/project.pbxproj`

### 0.2 Sentry signup (15 นาที) — free tier 5k events/mo

1. ไป https://sentry.io/signup/ — สมัครด้วย Google/GitHub
2. ตั้งชื่อ Organization = `np-commerce` (ใช้เป็น `SENTRY_ORG`)
3. สร้าง 3 projects:
   - `javascript-nextjs` (Platform: Next.js, default slug) — เก็บ DSN เป็น `NEXT_PUBLIC_SENTRY_DSN`
     - ทางเลือก rename slug ที่ `Settings → Project → Project Slug` เป็น `np-commerce-web` (ชื่อสื่อความหมาย) — ไม่ rename ก็ได้แค่ต้อง sync `SENTRY_PROJECT_WEB` ใน CI secrets ให้ตรง
   - `np-commerce-ios` (Platform: Cocoa)
   - `np-commerce-android` (Platform: Android)
4. สร้าง Internal Integration token:
   - Settings → Custom Integrations → Create New Integration
   - ชื่อ `ci-fastlane` · Scopes:
     - `project:releases` (write)
     - `project:write` (read+write)
     - `org:read`
   - Save → คัด Token (โผล่ครั้งเดียว) → เก็บไว้ใช้เป็น `SENTRY_AUTH_TOKEN`
5. (เลือก) ตั้ง Alert rule ตัวแรก:
   - Sentry → Alerts → Create Alert
   - Type: Issue · Trigger: > 5 events ใน 10 min · Action: Send to Slack
   - Apply ทั้ง 3 projects

### 0.3 GitHub Environments + secrets (15 นาที)

1. GitHub repo → Settings → Environments → New environment
2. สร้าง 4 environments:
   - `ios-production` — Required reviewers: ตัวเอง (1 คน), Wait timer: 0 min
   - `android-production` — เหมือนกัน
   - `ota-production` — เหมือนกัน
   - `ota-beta` — ไม่ต้อง reviewer (ปล่อยให้ rollout เร็ว)
3. ลง secret ระดับ **Repository** (ใช้ร่วม) — Settings → Secrets → Actions:
   - `NEXT_PUBLIC_SENTRY_DSN` ← จาก Sentry web project
   - `SENTRY_AUTH_TOKEN` ← จาก step 0.2 ข้อ 4
   - `SENTRY_ORG` = `np-commerce`
   - `SENTRY_PROJECT_WEB` = `javascript-nextjs` (หรือ slug ที่ rename เอง — ดู step 0.2)
   - `SENTRY_PROJECT_NATIVE_IOS` = `np-commerce-ios`
   - `SENTRY_PROJECT_NATIVE_ANDROID` = `np-commerce-android`

> ตอนนี้ค่าอื่นยังไม่มี ค่อย ๆ เพิ่มเมื่อทำ Day 1-3 เสร็จ

### 0.4 อัปเดต env ในเครื่อง dev (5 นาที)

`apps/web/.env.local`:

```ini
NEXT_PUBLIC_SENTRY_DSN=<DSN-from-sentry-web-project>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_APP_BUILD=dev
```

`apps/api/.env`:

```ini
# Phase 16 — App version gate
APP_LATEST_VERSION=1.0.0
APP_MIN_SUPPORTED=1.0.0
APP_IOS_STORE_URL=https://apps.apple.com/app/np-commerce/id000000000
APP_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=app.np.commerce

# Phase 18 — Live Updates (placeholder จนกว่าจะ publish bundle ครั้งแรก)
LIVE_UPDATES_VERSION=1.0.0
LIVE_UPDATES_BUILD_ID=none
LIVE_UPDATES_BUNDLE_URL=
LIVE_UPDATES_CHECKSUM=
LIVE_UPDATES_BUNDLE_SIZE_BYTES=0
LIVE_UPDATES_MIN_NATIVE_VERSION=1.0.0
LIVE_UPDATES_ROLLOUT_PCT=0
LIVE_UPDATES_PAUSE=0
```

✅ **Day 0 เสร็จเมื่อ**: `pnpm dev` เปิด localhost:3000 + Sentry web project รับ test event แล้ว
(test event: `pnpm exec npx @sentry/wizard@latest -i nextjs` หรือ `throw new Error('test')` ใน page แล้วดู Sentry)

---

## Day 1 — เปิดบัญชี Store (จ่ายเงิน) ⏱ 1-2 ชั่วโมง + รอ Apple verify 24-48 ชม.

### 1.1 Apple Developer Program ($99/y) — รอ verify 24-48 ชม.

1. ไป https://developer.apple.com/programs/enroll/
2. เลือก enrollment type:
   - **Individual** ($99) — ใช้ชื่อ + Apple ID ส่วนตัว (เร็ว, แต่ App Store name = ชื่อจริงของเรา)
   - **Organization** ($99) — ต้องมี D-U-N-S Number ของบริษัท (รอ verify D-U-N-S ~ 1-2 สัปดาห์, App Store name = ชื่อบริษัท)
3. ถ้าเป็น Organization และยังไม่มี D-U-N-S:
   - ขอฟรีที่ https://www.dnb.com/duns-number/get-a-duns.html (ใช้เลขนิติบุคคล)
   - รอ 5-30 วัน
4. จ่ายผ่านบัตรเครดิต $99 (~3,300 บาท)
5. รอ email "Welcome to the Apple Developer Program" — 24-48 ชม.
6. หลัง verify เสร็จ:
   - ไป https://developer.apple.com/account/resources/identifiers/list → + Register an App ID
   - Bundle ID = `app.np.commerce` (Explicit) · Capabilities: Push Notifications, Associated Domains, Sign in with Apple (เลือก ถ้าจะใช้อนาคต)
   - เก็บ `Team ID` 10 chars จากหน้า Membership → secret `APPLE_TEAM_ID`

### 1.2 Google Play Console ($25 one-time) — verify ทันที

1. ไป https://play.google.com/console/signup
2. เลือก account type:
   - **Personal** — ใช้ Google account ส่วนตัว (เร็วที่สุด)
   - **Organization** — ต้องมี DUNS (เหมือน Apple) หรือ Tax ID ของบริษัท
3. จ่ายผ่านบัตรเครดิต $25 (~830 บาท, จ่ายครั้งเดียวตลอดชีวิต)
4. กรอก contact info → submit → verify 1-3 วัน
5. หลัง verify:
   - สร้าง app: Play Console → Create app → "NP Commerce" · Default language: Thai · Type: App · Free
   - ตอบ Declarations checkboxes
   - กดเข้า app → จะเห็น dashboard ของ NP Commerce

### 1.3 App Store Connect — เปิด app record

(ต้องรอ 1.1 verify เสร็จก่อน)

1. ไป https://appstoreconnect.apple.com/ → Sign in
2. My Apps → + → New App
3. กรอก:
   - Platforms: iOS
   - Name: `NP Commerce`
   - Primary Language: Thai
   - Bundle ID: `app.np.commerce` (เลือกจาก dropdown)
   - SKU: `np-commerce-ios-prod` (ภายใน, ไม่ public)
   - User Access: Full
4. กด Create → app status = "Prepare for Submission"

### 1.4 App Store Connect API key (สำหรับ Fastlane)

1. App Store Connect → Users and Access → Integrations tab → API Keys
2. + Generate API Key
3. ชื่อ `np-fastlane-ci` · Access: `App Manager` (ขั้นต่ำที่ TestFlight upload ต้องการ)
4. Download `.p8` file (โผล่ครั้งเดียว!)
5. คัด:
   - Key ID (10 chars) → secret `APPLE_API_KEY_ID`
   - Issuer ID (UUID หัวตาราง) → `APPLE_API_KEY_ISSUER_ID`
   - `.p8` content → encode base64:
     ```bash
     base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
     ```
   - paste → `APPLE_API_KEY_CONTENT`

✅ **Day 1 เสร็จเมื่อ**:
- Apple Developer status = Active + App ID registered + API Key downloaded
- Play Console app created (sees dashboard)
- 4 secrets ใน GitHub: `APPLE_API_KEY_ID`, `APPLE_API_KEY_ISSUER_ID`, `APPLE_API_KEY_CONTENT`, `APPLE_TEAM_ID`

---

## Day 2 — Bind signing assets ⏱ 1-2 ชั่วโมง

### 2.1 Android Keystore (10 นาที + เก็บ offline 2 ที่)

> ⚠️ **CRITICAL**: ถ้า keystore หาย = ไม่สามารถ update app บน Play Store
> ได้ตลอดชีวิต (ต้องสร้าง app ใหม่ + user reinstall). เก็บ:
>   1) 1Password / Bitwarden vault
>   2) Offline USB stick + กล่องเก็บที่บ้าน
>   3) (เลือก) Google Drive ส่วนตัวที่เปิด 2FA

```bash
cd /Users/npcreate/np-commerce-os/apps/web/android/app

keytool -genkeypair -v \
  -keystore release.keystore \
  -alias np-release \
  -keyalg RSA -keysize 2048 \
  -validity 9125 \
  -dname "CN=NP Commerce, OU=Mobile, O=NP, L=Bangkok, S=Bangkok, C=TH"
```

> validity 9125 = 25 ปี (Google แนะนำ ≥25 ปี ตั้งแต่ Aug 2021)

จะ prompt 2 ครั้ง:
- Keystore password (เก็บไว้ ใช้เป็น `ANDROID_KEYSTORE_PASSWORD`)
- Key password (ใช้ same password ก็ได้ → `ANDROID_KEY_PASSWORD`)

หลังสร้างเสร็จ:

```bash
# 1) ตรวจ
keytool -list -v -keystore release.keystore -alias np-release

# 2) Base64 encode → secret
base64 -i release.keystore | pbcopy
# paste → ANDROID_KEYSTORE_BASE64 ใน GitHub secrets

# 3) Backup offline (อย่าลืม!)
cp release.keystore ~/Backups/np-commerce/release.keystore.$(date +%Y%m%d)
cp release.keystore /Volumes/Backup-USB/np-commerce/

# 4) ห้ามใน git
echo "release.keystore" >> .gitignore  # มีอยู่แล้วใน apps/web/android/.gitignore
```

ลงเพิ่ม secrets ใน GitHub:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` = `np-release`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_PACKAGE_NAME` = `app.np.commerce`

### 2.2 Google Play Service Account (15 นาที)

1. Play Console → Setup → API access
2. กด "Create new service account" — ระบบจะลิงก์ไป Google Cloud Console
3. ใน GCP:
   - สร้าง project `np-commerce-mobile` (หรือใช้ที่มีอยู่)
   - IAM & Admin → Service Accounts → + Create
   - Name: `play-fastlane-ci` · Role: `Service Account User`
   - กด Done
   - คลิก service account ที่สร้าง → Keys tab → Add Key → Create new key → JSON
   - ดาวน์โหลด JSON (โผล่ครั้งเดียว!)
4. กลับ Play Console → API access → Refresh → "Grant access" ที่ service account
   - Permissions: `Admin (all permissions)` (สำหรับ first setup) หรือ `Release Manager` (เพียงพอ production)
   - กด Invite + Send
5. คัด JSON content (ทั้งไฟล์) → paste → secret `PLAY_SERVICE_ACCOUNT_JSON`

### 2.3 APNs key (iOS push notifications) — 5 นาที

1. Apple Developer → Certificates, Identifiers & Profiles → Keys → + Generate
2. Name: `np-commerce-apns` · Enable "Apple Push Notifications service (APNs)"
3. Download `.p8` (โผล่ครั้งเดียว!)
4. คัด Key ID + Team ID
5. ส่งให้ API backend (`apps/api`):
   - upload `.p8` ไปเก็บที่ secret manager (เช่น Vercel env, AWS Secrets Manager)
   - env vars สำหรับ Phase 9.1 notifications module:
     - `APNS_KEY_ID`
     - `APNS_TEAM_ID`
     - `APNS_BUNDLE_ID` = `app.np.commerce`
     - `APNS_KEY_PATH` (path ของ `.p8` file ใน server) หรือ `APNS_KEY_CONTENT_BASE64`

### 2.4 Fastlane Match repo (20 นาที)

> Match = git repo ที่เก็บ cert + provisioning profile (encrypted) ของ Apple

1. สร้าง **private** GitHub repo ใหม่: `np-commerce/ios-certificates`
2. ใน local:

```bash
cd /Users/npcreate/np-commerce-os/apps/web/ios

# ติดตั้ง bundler + gems
gem install bundler
bundle install
```

3. รัน match init ครั้งแรก:

```bash
bundle exec fastlane match init
# 1. Storage mode: git
# 2. Git URL: git@github.com:np-commerce/ios-certificates.git (ของจริง)
# 3. Set MATCH_PASSWORD = passphrase ที่สร้างเอง (32+ chars, เก็บ 1Password)
```

4. สร้าง cert ครั้งแรก:

```bash
bundle exec fastlane match appstore
# 1. Login Apple ID
# 2. Match จะ generate cert + provisioning profile + push เข้า private repo
```

5. สร้าง bot user สำหรับ CI:
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
   - Token name: `np-mobile-ci`
   - Repository access: Only `np-commerce/ios-certificates`
   - Permissions: Contents → Read
   - Generate → คัด `ghp_xxx`
6. ลง secret:

```bash
echo -n "<bot-username>:<ghp_xxx>" | base64
# paste → MATCH_GIT_BASIC_AUTHORIZATION
```

- `MATCH_GIT_URL` = `https://github.com/np-commerce/ios-certificates.git` (HTTPS, ไม่ใช่ ssh สำหรับ CI)
- `MATCH_PASSWORD` = passphrase จาก step 3

✅ **Day 2 เสร็จเมื่อ**: secrets ครบ:
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_PACKAGE_NAME`
- `PLAY_SERVICE_ACCOUNT_JSON`
- `MATCH_GIT_URL`, `MATCH_GIT_BASIC_AUTHORIZATION`, `MATCH_PASSWORD`, `APPLE_BUNDLE_ID`
- (Backend) APNs key พร้อมส่ง notifications

---

## Day 3 — OTA Infrastructure ⏱ 1-2 ชั่วโมง

### 3.1 AWS S3 + CloudFront + IAM (30 นาที)

> ทางเลือก: ใช้ Cloudflare R2 + Workers แทนได้ (ราคาถูกกว่า แต่ setup ต่างกัน — ดู section 3.6)

1. สร้าง S3 bucket:

```bash
aws s3 mb s3://np-app-live-updates --region ap-southeast-1
aws s3api put-bucket-versioning \
  --bucket np-app-live-updates \
  --versioning-configuration Status=Enabled
```

2. ตั้ง bucket policy (public read บน path `bundles/*` เท่านั้น):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::np-app-live-updates/bundles/*"
  }]
}
```

```bash
aws s3api put-bucket-policy --bucket np-app-live-updates --policy file://policy.json
```

3. สร้าง CloudFront distribution (ให้ user ดาวน์โหลดเร็วในเอเชีย):

```bash
# console: https://console.aws.amazon.com/cloudfront/
# - Origin: np-app-live-updates.s3.ap-southeast-1.amazonaws.com
# - Origin path: /bundles
# - Behavior: GET, HEAD only · Cache policy: CachingOptimized
# - Restrict viewer access: No
# - SSL: Default CloudFront SSL (หรือใช้ custom domain cdn.np.app + ACM cert)
```

   หลัง deploy 10-15 นาที จะได้ URL เช่น `https://d1234abcd.cloudfront.net`
   → ตั้ง CNAME `cdn.np.app` ชี้ไป (Route 53 หรือ DNS provider ของคุณ)

4. สร้าง IAM user สำหรับ CI:

```bash
aws iam create-user --user-name ci-live-updates
aws iam attach-user-policy \
  --user-name ci-live-updates \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
# ดีกว่า: สร้าง inline policy เฉพาะ s3:PutObject บน bucket นี้
aws iam create-access-key --user-name ci-live-updates
# → คัด AccessKeyId + SecretAccessKey
```

5. ลง secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` = `ap-southeast-1`
- `LIVE_UPDATES_S3_BUCKET` = `np-app-live-updates`
- `LIVE_UPDATES_CDN_BASE` = `https://cdn.np.app/bundles` (หรือ CloudFront URL ถ้ายังไม่ตั้ง CNAME)

### 3.2 API webhook handler (45 นาที — ต้องเขียนเอง)

> Workflow `mobile-live-update.yml` ส่ง POST ไปที่ `API_DEPLOY_HOOK_URL` พร้อม
> HMAC signature เพื่อ bump `LIVE_UPDATES_*` env vars บน API host

เลือก 1 ใน 3 ทาง:

#### ทางเลือก A: Vercel env API (ถ้า API deploy บน Vercel) — ง่ายสุด

1. สร้าง Vercel Token: https://vercel.com/account/tokens → Create
2. ใส่ใน secret `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` + `VERCEL_TEAM_ID`
3. แก้ `mobile-live-update.yml` ขั้น "Bump API manifest env vars" ให้เรียก:

```bash
# example PATCH each env var via Vercel API
for k in LIVE_UPDATES_BUILD_ID LIVE_UPDATES_VERSION LIVE_UPDATES_BUNDLE_URL LIVE_UPDATES_CHECKSUM; do
  curl -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$k\",\"value\":\"...\",\"type\":\"plain\",\"target\":[\"production\"]}"
done
# แล้ว trigger redeploy
curl -X POST "https://api.vercel.com/v1/integrations/deploy/<hook-id>" -H "Authorization: Bearer $VERCEL_TOKEN"
```

#### ทางเลือก B: เพิ่ม endpoint ใน NestJS

สร้าง `apps/api/src/common/live-updates-admin.controller.ts`:

```ts
import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Controller('admin/live-updates')
export class LiveUpdatesAdminController {
  @Post('publish')
  publish(
    @Headers('x-np-signature') signature: string,
    @Body() body: {
      channel: 'production' | 'beta';
      version: string;
      buildId: string;
      url: string;
      checksum: string;
      size: number;
      rolloutPct: number;
    },
  ) {
    const secret = process.env.LIVE_UPDATES_DEPLOY_HOOK_SECRET;
    if (!secret) throw new UnauthorizedException();

    const expected = 'sha256=' + createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (!timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expected))) {
      throw new UnauthorizedException();
    }

    // ⚠️ Limitation: process.env writes don't persist process restart.
    // For Vercel/Railway/Fly: ต้องเรียก provider API หรือใช้
    // external KV (Redis/Cloudflare KV) แทน
    process.env.LIVE_UPDATES_VERSION = body.version;
    process.env.LIVE_UPDATES_BUILD_ID = body.buildId;
    process.env.LIVE_UPDATES_BUNDLE_URL = body.url;
    process.env.LIVE_UPDATES_CHECKSUM = body.checksum;
    process.env.LIVE_UPDATES_BUNDLE_SIZE_BYTES = String(body.size);
    process.env.LIVE_UPDATES_ROLLOUT_PCT = String(body.rolloutPct);

    return { ok: true };
  }
}
```

แล้วเพิ่มใน `app.module.ts` controllers array

#### ทางเลือก C: Redis-backed manifest (recommended สำหรับ scale)

แทนการ bump env vars → เก็บ manifest ใน Redis (ใช้ Redis ที่มีอยู่แล้ว
จาก Phase 1+):

```ts
// live-updates.controller.ts (เพิ่ม injection)
constructor(@Inject('REDIS') private readonly redis: Redis) {}

@Get('manifest')
async manifest(...): Promise<LiveUpdateManifest> {
  const channel = ...;
  const cached = await this.redis.get(`live-updates:manifest:${channel}`);
  if (cached) return JSON.parse(cached);
  // fall back to env vars (Day 0 setup)
  return this.envBasedManifest(...);
}

// admin endpoint sets Redis key
await this.redis.set(`live-updates:manifest:${channel}`, JSON.stringify(payload));
```

> แนะนำ: เริ่มด้วย **ทางเลือก B** (NestJS endpoint + env vars) สำหรับเดือนแรก
> แล้วค่อย migrate ไป Redis-backed ตอน scale > 10k DAU

6. สร้าง shared secret:

```bash
openssl rand -hex 32 | pbcopy
# paste → secret API_DEPLOY_HOOK_SECRET (ทั้งใน GitHub + API host env)
```

- `API_DEPLOY_HOOK_URL` = `https://api.np.app/v1/admin/live-updates/publish` (ของทางเลือก B)
- `API_URL` = `https://api.np.app` (สำหรับ smoke test workflow)

✅ **Day 3 เสร็จเมื่อ**:
- S3 + CloudFront test upload `echo hi > test.txt && aws s3 cp test.txt s3://.../bundles/`
  แล้ว `curl https://cdn.np.app/bundles/test.txt` ได้
- secrets `AWS_*`, `LIVE_UPDATES_S3_BUCKET`, `LIVE_UPDATES_CDN_BASE`, `API_DEPLOY_HOOK_URL`, `API_DEPLOY_HOOK_SECRET`, `API_URL` ครบ
- ทดลอง POST hook endpoint ด้วย curl + valid signature → 200 OK

---

## Day 4 — End-to-end smoke test ⏱ 2-4 ชั่วโมง

### 4.1 Manual first upload (กดเอง 1 ครั้งเพื่อ unlock CI track)

> Apple + Google ต้องการ "first build" จาก dashboard ก่อนเปิดทาง API upload

#### iOS — first TestFlight build (ผ่าน Xcode)

```bash
cd /Users/npcreate/np-commerce-os
BUILD_STATIC=true pnpm --filter web build
CAPACITOR_COCOAPODS_PATH=$(which pod) pnpm --filter web exec cap sync ios
pnpm --filter web exec cap open ios
```

ใน Xcode:
1. เลือก `Any iOS Device` ที่ scheme
2. Signing & Capabilities → Team: เลือก team ของคุณ
3. Product → Archive (รอ 5-10 นาที)
4. หลัง archive เสร็จ → Distribute App → App Store Connect → Upload
5. รอ 5-15 นาทีจน TestFlight processing เสร็จ → email confirm

#### Android — first AAB upload (ผ่าน Play Console)

```bash
cd apps/web/android
# Build AAB ด้วย gradle
./gradlew bundleRelease \
  -Pandroid.injected.signing.store.file=app/release.keystore \
  -Pandroid.injected.signing.store.password=$ANDROID_KEYSTORE_PASSWORD \
  -Pandroid.injected.signing.key.alias=np-release \
  -Pandroid.injected.signing.key.password=$ANDROID_KEY_PASSWORD
# Output: app/build/outputs/bundle/release/app-release.aab
```

ใน Play Console:
1. Testing → Internal testing → Create new release
2. Upload `app-release.aab`
3. กรอก release notes (ไทย) → Save → Review release → Roll out
4. ใน "Internal testers" tab → เพิ่ม email list ของตัวเอง + ทีม (max 100 คน)
5. รอ 5-15 นาที จน status = "Available" → คัด opt-in link
6. คนในทีมเปิด link บน Android device → install through Play Store

### 4.2 Fastlane locally (verify scripts ทำงาน) — 30 นาที

```bash
# iOS
cd apps/web/ios
bundle exec fastlane lanes        # ตรวจดูว่า list lanes ขึ้นถูกต้อง
bundle exec fastlane match appstore --readonly   # ทดสอบ sync (ใช้ secret ที่ตั้งไว้)

# Android
cd apps/web/android
bundle exec fastlane lanes
# จริงจัง: ลอง dry run
# bundle exec fastlane internal --verbose  (ระวัง: จะ upload จริง)
```

### 4.3 First CI run — 30 นาที

```bash
# Trigger workflow_dispatch แบบ manual จาก GitHub UI ก่อน
# GitHub → Actions → mobile-android → Run workflow → lane: internal
# ดู logs:
gh run watch
```

ถ้าผ่าน:
- ตรวจ Play Console → Internal Testing → เห็น build ใหม่จาก CI ขึ้น
- ตรวจ Sentry → Releases → เห็น release `app.np.commerce@1.0.0+<run-number>` พร้อม ProGuard mapping

จากนั้นทดลอง iOS workflow แบบเดียวกัน

### 4.4 OTA smoke test — 30 นาที

```bash
# 1) Push tag เพื่อ trigger live-update workflow
git tag live-v1.0.1
git push origin live-v1.0.1

# 2) ดู workflow run
gh run watch

# 3) Verify manifest endpoint
curl -s "https://api.np.app/v1/app/live-updates/manifest?platform=ios&nativeVersion=1.0.0&channel=beta" | jq
# ที่ควรเห็น:
# {
#   "updateAvailable": true,
#   "version": "1.0.0",
#   "buildId": "1.0.0-<short-sha>",
#   "url": "https://cdn.np.app/bundles/web-bundle-1.0.0-<sha>.zip",
#   "checksum": "<sha256>",
#   ...
# }

# 4) Verify CDN URL
curl -I "$(curl -s '...' | jq -r .url)"
# ที่ควรเห็น: HTTP/2 200 + Content-Type: application/zip
```

### 4.5 First crash test — 15 นาที

ใน TestFlight build ที่ติดตั้งบนมือถือจริง:
1. เปิดแอป → ไปที่หน้าใด ๆ
2. เพิ่ม dev-only button:
   ```tsx
   {process.env.NODE_ENV === 'development' && (
     <button onClick={() => { throw new Error('Sentry test crash'); }}>
       💥 Force crash (test)
     </button>
   )}
   ```
   หรือใช้ Sentry's `Sentry.captureException()` แทน throw จริง
3. กด → ปิดแอป → เปิดใหม่
4. ดู Sentry → Issues → ภายใน 1 นาทีจะมี event ใหม่ + stacktrace ที่ resolve แล้ว
   (สังเกต `release: app.np.commerce@1.0.0+xxx` ตรงกับ build ที่ติดตั้ง)

✅ **Day 4 เสร็จเมื่อ**:
- Manual TestFlight build ปรากฏใน App Store Connect → TestFlight tab
- Manual AAB ปรากฏใน Play Console → Internal Testing → status = Available
- CI workflow `mobile-android` รัน + success + เห็น build ใหม่ใน Play Console
- OTA bundle อัปโหลด S3 + manifest endpoint คืน URL ที่ใหม่
- Sentry รับ event จาก native build จริง + ภายใน 1 นาที + stacktrace ชัดเจน

---

## Day 5 — Closed Beta + Submit Review ⏱ 1-2 ชั่วโมง + รอ review

### 5.1 ส่ง Closed Beta (TestFlight external testers) — Apple

1. App Store Connect → My App → TestFlight tab
2. Build ที่ Day 4 อัปไป → กด "Manage" ที่ Test Information
3. กรอก:
   - Beta App Description (Thai + English)
   - Beta App Feedback Email
   - Beta App Marketing URL (อย่าใส่)
   - Privacy Policy URL: `https://np.app/legal/privacy` ✓ (จาก Phase 17)
   - **Sign-In Information** (สำคัญ! reviewer ใช้ test account นี้):
     - Username: `reviewer@np.app`
     - Password: `NPReview2026!`
     - Notes: ใส่ note ตาม `docs/store-listing/apple/review-info.md`
4. Add External Group → ชื่อ `Closed Beta - Wave 1`
5. Add Testers → emails ของ test users (max 10,000 คน — start 50)
6. Submit for Beta App Review (free, 24-48 ชม.)
7. หลัง approve → testers ได้รับ email + opt-in link

### 5.2 ส่ง Closed Beta — Google Play

1. Play Console → Testing → Closed Testing → Create track "Closed Beta"
2. กด "Create new release" → เลือก AAB จาก Day 4
3. กรอก release notes
4. ใน "Testers" tab → "Create email list" → upload CSV ของ testers (max 100, start 50)
5. Roll out → testers ได้ opt-in link ทันที (Google ไม่ต้อง review สำหรับ closed)

### 5.3 ส่ง Production Review (เมื่อ Closed Beta นิ่งแล้ว 7-14 วัน)

#### Apple App Store

1. App Store Connect → My App → App Store tab
2. กรอก App Information ตาม `docs/store-listing/apple/metadata.md`:
   - Name, Subtitle, Promotional Text, Description, Keywords, Support URL, Privacy Policy URL
3. Pricing & Availability: Free + เลือกประเทศที่ launch (เริ่ม Thailand เท่านั้น)
4. Upload Screenshots (capture จาก Day 4 testflight build):
   - 6.7" iPhone (mandatory) · 6.5" · 5.5" (เลือกถ้ามี)
   - iPad 12.9" (mandatory ถ้า support iPad)
   - 3-10 screenshots ต่อขนาด
5. App Review Information:
   - Sign-in info: `reviewer@np.app` / `NPReview2026!`
   - Contact info + Notes
6. Submit for Review → Apple ใช้ 24-48 ชม. (สูงสุด 7 วัน)
7. หลัง approve:
   - Phased Release: เลือก "Automatically release this version" → Apple rollout ค่อย ๆ 1%→2%→5%→...→100% ใน 7 วัน

#### Google Play

1. Play Console → Production track → Create new release
2. Upload AAB (จาก CI workflow ล่าสุด)
3. กรอก Store listing ตาม `docs/store-listing/google/metadata.md`
4. กรอก Data safety form ตาม `docs/store-listing/google/data-safety.md`
5. Content rating questionnaire (จะได้ rating "Everyone" หรือ "Teen")
6. Target audience: 13+
7. Roll out: เลือก "Staged rollout" → 5% rollout
8. Submit → Google ใช้ 1-7 วัน
9. หลัง approve: เพิ่ม rollout % ทุก 2-3 วันถ้า crash-free > 99.5%
   - 5% → 20% → 50% → 100%

✅ **Phase 18 ปิดเมื่อ**:
- iOS app ขึ้น App Store production ที่ Thailand
- Android app ขึ้น Play Store production rollout 100%
- Crash-free user > 99.5% ติดต่อกัน 7 วัน
- OTA bundle update ทดลอง deploy + apply ผ่าน UX จริงสำเร็จ (silent + restart)

---

## เครื่องมือเสริม + tips

### กดเช็คสถานะ secrets

```bash
# GitHub
gh secret list

# ดูว่า workflow ใช้ secret อะไรบ้าง
grep -rE "secrets\." .github/workflows/

# Sentry token ใช้งานได้ไหม
curl -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/np-commerce/projects/" | jq '.[].slug'
```

### Apple/Google deadline calendar

| รายการ | ทำเมื่อไหร่ | Auto-fail ถ้า expire |
|--------|-------------|----------------------|
| Apple Dev Program | ทุกปี (renew 30 วันก่อนหมด) | App หายจาก Store ทันที |
| iOS Distribution Cert | match จัดการให้ — แต่ระวัง revoke | Build fail (ไม่กระทบ user) |
| iOS Provisioning Profile | match จัดการให้ | Build fail |
| APNs `.p8` Key | ไม่มี expire | - |
| Android Keystore | 25 ปี (ที่ตั้งไว้) | App update ไม่ได้ตลอดชีวิต ⚠️ |
| Play Service Account Key | 90 วัน (recommended rotate) | CI upload fail |
| Sentry Auth Token | 6 เดือน (recommended) | dSYM upload silent fail (crashes ยังมา แต่ unresolved) |

### Cost summary

| รายการ | One-time | Monthly | ปีแรก (TH baht) |
|--------|----------|---------|-----------------|
| Apple Developer Program | $99/y | - | ~3,300 |
| Google Play Console | $25 | - | ~830 |
| AWS S3 (`np-app-live-updates`) | - | < $1 (storage 1GB) | ~330 |
| AWS CloudFront | - | $2-10 (10k MAU) | ~1,300 |
| Sentry (free tier) | - | $0 (5k events/mo) — bump เป็น Team $29/mo ตอน scale | 0 |
| Domain `cdn.np.app` (Route 53) | - | $0.50 | ~200 |
| **รวม** | **$124** | **~$5/mo** (10k MAU) | **~5,960 บาท/ปี** |

---

## Cheat sheet — คำสั่งที่ใช้บ่อย

```bash
# Local: build + sync + open
BUILD_STATIC=true pnpm --filter web build
CAPACITOR_COCOAPODS_PATH=$(which pod) pnpm --filter web exec cap sync
pnpm --filter web exec cap open ios       # หรือ android

# Local: Fastlane (เทสก่อน push tag)
cd apps/web/ios && bundle exec fastlane beta
cd apps/web/android && bundle exec fastlane internal

# CI: trigger native build
git tag mobile-v1.0.0
git push origin mobile-v1.0.0

# CI: trigger OTA only
git tag live-v1.0.1
git push origin live-v1.0.1

# CI: manual dispatch
gh workflow run mobile-ios.yml -f lane=beta
gh workflow run mobile-live-update.yml -f rollout_pct=25 -f channel=beta

# Watch run
gh run watch

# Emergency rollback OTA
# (เซต env LIVE_UPDATES_PAUSE=1 บน API host)
curl -X POST "$API_DEPLOY_HOOK_URL/pause" \
  -H "X-NP-Signature: sha256=$(echo -n '{"pause":true}' | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')" \
  -d '{"pause":true}'
```

ดู `docs/phase-18-mobile-ops.md` ส่วน "Rollback playbook" สำหรับ 3 สถานการณ์อื่น
