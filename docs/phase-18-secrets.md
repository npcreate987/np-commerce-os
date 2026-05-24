# Phase 18 — Mobile CI Secrets Reference

> ทุก secret ลงทะเบียนใน **GitHub Settings → Secrets and variables → Actions**
> และผูกกับ **Environment** เพื่อบังคับ manual approval ก่อน deploy
>
> ห้าม commit ค่า secret ลง repo เด็ดขาด

---

## 1) Apple App Store Connect (iOS)

| Secret                          | คำอธิบาย                                                                 | ที่มา                                                                          |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `APPLE_API_KEY_ID`              | Key ID 10-char                                                           | App Store Connect → Users and Access → Integrations → API Keys                 |
| `APPLE_API_KEY_ISSUER_ID`       | UUID ของ issuer                                                          | หน้าเดียวกัน → "Issuer ID" บนหัวตาราง                                          |
| `APPLE_API_KEY_CONTENT`         | base64-encoded ของไฟล์ `.p8`                                             | `cat AuthKey_XXXX.p8 \| base64 \| pbcopy`                                      |
| `APPLE_TEAM_ID`                 | 10-char team id                                                          | developer.apple.com → Membership                                               |
| `APPLE_BUNDLE_ID`               | `app.np.commerce`                                                        | -                                                                              |
| `APPLE_ID`                      | (optional) email Apple ID                                                | สำหรับ fastlane match ถ้าจำเป็น                                                |

## 2) Fastlane Match (private cert repo)

| Secret                            | คำอธิบาย                                              | ที่มา                                  |
| --------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| `MATCH_GIT_URL`                   | git ssh URL ของ certs repo                            | `git@github.com:np-commerce/ios-certificates.git` |
| `MATCH_GIT_BASIC_AUTHORIZATION`   | `base64("user:pat")` (ใช้แทน SSH ใน CI)               | สร้าง PAT scope `repo` ของ bot user      |
| `MATCH_PASSWORD`                  | Passphrase สำหรับ decrypt match repo                  | สร้างเอง (32+ chars)                   |

## 3) Google Play Console (Android)

| Secret                            | คำอธิบาย                                                       | ที่มา                                                                       |
| --------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `ANDROID_PACKAGE_NAME`            | `app.np.commerce`                                              | -                                                                           |
| `ANDROID_KEYSTORE_BASE64`         | base64 ของ release.keystore                                    | `keytool -genkeypair ...` → `base64 release.keystore \| pbcopy`             |
| `ANDROID_KEYSTORE_PASSWORD`       | password ของ keystore                                          | -                                                                           |
| `ANDROID_KEY_ALIAS`               | alias key (เช่น `np-release`)                                  | -                                                                           |
| `ANDROID_KEY_PASSWORD`            | password ของ alias                                             | -                                                                           |
| `PLAY_SERVICE_ACCOUNT_JSON`       | JSON เนื้อหาเต็ม                                               | GCP → IAM & Admin → Service Accounts → ใส่ role `Release Manager` ผ่าน Play |

> **เคล็ดลับ**: Keystore สูญหาย = ไม่สามารถ update แอปได้ตลอดชีวิต (Google
> ไม่ allow re-sign) — เก็บสำเนาใน 1Password + offline USB

## 4) Sentry (crash + perf observability)

| Secret                            | คำอธิบาย                              | ที่มา                                            |
| --------------------------------- | ------------------------------------- | ------------------------------------------------ |
| `SENTRY_AUTH_TOKEN`               | Internal Integration token            | sentry.io → Settings → Account → API → Auth Tokens (scope: `project:releases`, `project:write`, `org:read`) |
| `SENTRY_ORG`                      | org slug (เช่น `np-commerce`)         | -                                                |
| `SENTRY_PROJECT_NATIVE_IOS`       | project slug (เช่น `np-commerce-ios`) | -                                                |
| `SENTRY_PROJECT_NATIVE_ANDROID`   | project slug                          | -                                                |
| `SENTRY_PROJECT_WEB`              | project slug ของ web                  | สร้างไว้ตั้งแต่ Phase 13.1                       |
| `NEXT_PUBLIC_SENTRY_DSN`          | DSN public (มี protocol-keyed value)  | sentry.io → Projects → Client Keys (DSN)         |

## 5) Live Updates (OTA) — Cloudflare R2

> เปลี่ยนจาก AWS S3 + CloudFront → **Cloudflare R2** (Phase 18 revision 2026-05-24)
> เหตุผล: ฟรี egress, ฟรี 10 GB storage, ไม่ต้องสมัคร AWS, ใช้ S3-compatible API
> (AWS CLI ใช้ได้ตรงๆ ผ่าน `--endpoint-url`)

| Secret                          | คำอธิบาย                                                                       | ที่มา                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `R2_ACCESS_KEY_ID`              | R2 API token — Object Read & Write (scope = bucket เดียว)                      | dash.cloudflare.com → R2 → Manage R2 API Tokens → Create               |
| `R2_SECRET_ACCESS_KEY`          | secret access key (แสดงครั้งเดียวตอน create token)                              | หน้าเดียวกัน                                                            |
| `R2_ENDPOINT_URL`               | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`                                | Account ID อยู่ใน dash URL หรือบน home page sidebar                     |
| `R2_BUCKET`                     | `np-commerce-live-updates`                                                     | สร้างที่ dash → R2 Object Storage → Create bucket (เลือก APAC)         |
| `R2_PUBLIC_BASE`                | `https://pub-<RANDOM>.r2.dev` (สำหรับ public download โดย client)              | bucket → Settings → Public Development URL → Allow Access              |
| `API_DEPLOY_HOOK_URL`           | (optional) webhook URL บน API host = `${API_URL}/v1/app/live-updates/webhook` | จะใช้ตอน API deployed (Phase 19+) — ถ้าไม่ตั้ง workflow จะ emit ลง summary |
| `LIVE_UPDATES_WEBHOOK_SECRET`   | (optional) HMAC secret 32 chars สำหรับ verify webhook signature                | สร้างเอง — `openssl rand -hex 32`. **ต้อง paste ค่าเดียวกันที่ API host เป็น env var ชื่อเดียวกัน** |
| `API_URL`                       | (optional) เช่น `https://api.example.com` สำหรับ smoke test manifest          | ตั้งเมื่อ API deployed                                                 |

### Pre-flight: ทดสอบ R2 credentials ก่อน paste

```bash
# ใน terminal ของคุณ
source ~/keystores/np-commerce-vault.env
AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
AWS_DEFAULT_REGION=auto \
aws s3 ls --endpoint-url "$R2_ENDPOINT" s3://$R2_BUCKET/

# ✅ คาดหวัง: empty output (bucket ใหม่ ยังไม่มี object) — ไม่ error = pass
# ❌ ถ้าได้ "InvalidAccessKeyId" → token ผิด, ดู R2 → Manage R2 API Tokens
```

## 6) Other

| Secret                            | คำอธิบาย                                       |
| --------------------------------- | ---------------------------------------------- |
| `IONIC_TOKEN`                     | (เลิกใช้ — เราใช้ self-host แทน Ionic Appflow) |

---

## รูปแบบ Environment ใน GitHub

สร้าง 3 environments:

1. `ios-production`        — บังคับ "Required reviewers" 1 คน ก่อน workflow รันบน `mobile-ios`
2. `android-production`    — เหมือนกันสำหรับ `mobile-android`
3. `ota-production`        — สำหรับ live-update channel = production (ต้อง approve)
4. `ota-beta`              — ไม่ต้อง approve (rollout เร็ว)

แต่ละ env ผูก secrets ของตัวเองได้ (override ที่ repo-level ได้)

---

## วิธี rotate

| Secret                          | ความถี่      | วิธี                                                          |
| ------------------------------- | ----------- | ------------------------------------------------------------- |
| `APPLE_API_KEY_*`               | 1 ปี / ครั้ง | Revoke ใน App Store Connect แล้วสร้างใหม่                     |
| `PLAY_SERVICE_ACCOUNT_JSON`     | 90 วัน      | GCP IAM → service account → Keys → delete old, add new        |
| `MATCH_PASSWORD`                | ทุกปี        | `match nuke + match init` ใหม่ (sync devs ทุกคน)              |
| Keystore                        | ห้ามเปลี่ยน  | ใช้ตลอดอายุของแอป                                              |
| `SENTRY_AUTH_TOKEN`             | 6 เดือน      | สร้างใหม่ → revoke เก่า                                       |
| `LIVE_UPDATES_WEBHOOK_SECRET`   | 3 เดือน      | rotate ทั้ง 2 ที่ (GitHub Actions + API host env)              |

---

## Pre-flight checklist (ก่อนรัน CI ครั้งแรก)

- [ ] Apple Developer Program จ่ายค่า annual ($99/y) แล้ว
- [ ] Bundle ID `app.np.commerce` registered (App Store Connect → Identifiers)
- [ ] App record บน App Store Connect (สถานะ "Prepare for Submission")
- [ ] Match repo สร้างแล้ว + push first cert + first profile
- [ ] Google Play Console จ่าย $25 one-time แล้ว
- [ ] App record ใน Play Console + Internal Testing track เปิดแล้ว
- [ ] First AAB upload ผ่าน manual แล้ว (Play Console ต้อง draft ครั้งแรก)
- [ ] Service account ถูก link จาก Play Console → Users → Add new user (`Release Manager`)
- [ ] Sentry projects 2 ตัว (ios + android) + DSN copy ลง `NEXT_PUBLIC_SENTRY_DSN`
- [ ] **Cloudflare R2 bucket** `np-commerce-live-updates` พร้อม (Public Development URL = on)
- [ ] R2 API token scoped กับ bucket นั้น + smoke `aws s3 ls --endpoint-url ...` ผ่าน
- [ ] (optional) API host รับ webhook bump env vars แล้ว — ถ้ายังไม่มี ใช้ manual summary ใน Actions UI
