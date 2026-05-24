# Phase 19 — API Deployment + OTA Manifest Closing-the-Loop

> สถานะ: 🟡 plan (2026-05-24)
> Prereq: Phase 18 (Production Mobile Ops) — OTA bundle pipeline + R2 + Sentry done

> เป้าหมาย: deploy `apps/api` (NestJS) ไปยัง production host พร้อม Postgres,
> เพื่อ unblock 3 missing pieces ของ OTA loop
>
> 1. **Manifest endpoint** — `/v1/app/live-updates/manifest` (Capacitor app เรียก ทุก 6 ชม.)
> 2. **Webhook receiver** — `mobile-live-update.yml` workflow ส่งค่าใหม่หลัง R2 upload
> 3. **API URL** สำหรับ Capacitor app + Sentry tunnel + tracking events

---

## 1) ตอนนี้อยู่ที่ไหน

```
┌─────────────────────┐  ┌───────────────────┐  ┌───────────────────────┐
│ GitHub Actions      │→ │ Cloudflare R2     │  │ ??? (no API host)     │
│ mobile-live-update  │  │ pub-*.r2.dev      │  │                       │
│                     │  │ web-bundle-*.zip  │  │ GET /manifest         │
└─────────────────────┘  └───────────────────┘  │ POST /webhook         │
                                  ↑              │ env: LIVE_UPDATES_*   │
                                  │              └───────────────────────┘
                         ┌────────┴────────┐              │
                         │ Capacitor app    │              │
                         │ (iOS/Android)    │←──── ???─────┘
                         │ updater plugin   │
                         └─────────────────┘
```

**Gap**: API ที่ host บนเครื่องคุณ (`localhost:3001` ใน `.env.local`) — Capacitor app ในมือถือผู้ใช้เรียกไม่ได้

## 2) สิ่งที่ API ต้องทำ

| Endpoint | Role | Latency budget | RPS expected |
|----------|------|----------------|--------------|
| `GET /v1/app/live-updates/manifest` | OTA check (every 6h per device) | <500ms p95 | Low (10k MAU = ~28 req/h average, peaks at app launch) |
| `POST /v1/app/live-updates/webhook` | CI calls after R2 upload | <2s | <1/day |
| `POST /v1/track` | Tracking events (auto, persistent) | <300ms p95 | Med (1-5/min/user) |
| `POST /v1/auth/*` | Login/register | <1s p95 | Low (first session only) |
| `POST /v1/orders/*` | Cart → checkout | <2s p95 | Med (during commerce) |
| `GET /v1/products/*` | Catalog browse | <800ms p95 | High (every screen) |
| ~30 other resources | Standard CRUD | <500ms p95 | Mix |

**สรุป requirement**

- Node 20+ runtime
- ต้อง connect to Postgres (40+ models ผ่าน Prisma)
- ต้องการ HTTPS + custom domain (ภายหลัง — เริ่มต้นใช้ subdomain ของ host ได้)
- Cold start จำกัด (มือถือใช้แอป — เปิดทุก request)
- ขั้นต่ำ ~512 MB RAM, ~0.5 vCPU (Node + Prisma client baseline)

## 3) Hosting Options — Compared

### 3.1 Comparison Matrix

| Factor | Vercel | Railway | Fly.io | Render | Hetzner (VPS) |
|--------|--------|---------|--------|--------|----------------|
| **Setup time** | 15 min | 10 min | 30 min | 15 min | 2-4 hours |
| **Cold start** | 500ms-3s ❌ | None ✅ | None ✅ | 30s on free tier ⚠️ | None ✅ |
| **NestJS Fastify support** | needs adapter | native | native | native | native |
| **Postgres** | Neon (built-in) | Native add-on | external (Neon/Supabase) | Native (free tier limited) | self-managed |
| **Free tier** | 100GB BW + 1M functions | $5/mo trial only | 3 shared VMs + 3GB PG | 750h/mo + 256MB PG | none — €4/mo |
| **Paid starting** | Pro $20/mo | ~$5/mo per service | ~$2/mo per VM | $7/mo per service | €4-8/mo total |
| **Multi-region** | global (edge) | single region | multi-region native ✅ | single region | single |
| **Predictable bill** | usage-based ❌ | flat-ish ✅ | flat-ish ✅ | flat ✅ | flat ✅ |
| **Ops burden** | none ✅ | none ✅ | low | none ✅ | high ❌ |
| **DB backup auto** | yes (Neon) | yes ✅ | manual | yes | manual |
| **Custom domain free** | yes ✅ | yes ✅ | yes | yes | yes |
| **Lock-in risk** | medium | low (Docker) | low (Docker) | low | none |

### 3.2 Vercel — Detailed

**Pros**
- Cursor already uses Cloudflare Pages → adding Vercel is fine (no lock-in if you migrate later)
- **Neon Postgres** integrated — free 0.5 GB / $19/mo for 10 GB
- Best DX (preview deployments, env management)
- Auto SSL + edge network

**Cons**
- ⚠️ Cold start 500ms-3s on Hobby plan (warm starts <100ms) — Capacitor manifest call ที่เกิดทุก app launch จะรู้สึก lag ครั้งแรก
- ⚠️ 10s function timeout on Hobby, 60s on Pro — สำหรับ orders/payment ที่อาจ slow OK; OTA endpoint fine
- ⚠️ Function size 50MB compressed (Prisma client + node_modules + your code) — current API likely ~30-40MB, tight
- ⚠️ Vercel ทำให้ NestJS run แบบ serverless = ทุก request boot ใหม่ → ไม่เหมาะถ้าคุณมี in-memory cache, scheduled jobs, websockets

**Setup**
```bash
# 1. Vercel CLI
npm i -g vercel
# 2. Link
cd apps/api && vercel link
# 3. ต้องเขียน vercel.json + adapter (serverless-friendly NestJS bootstrap)
# 4. Push DB via prisma migrate deploy (from CI)
# 5. Set env vars in Vercel dashboard
```

**ราคารวมต่อเดือน** (estimate)
- Free: ~10k requests/day, 0.5GB DB → $0/mo (will exceed if >1k DAU)
- Pro + Neon Launch: ~$20 + $19 = **$39/mo**

### 3.3 Railway — Detailed

**Pros**
- **ง่ายสุดของ stack นี้** — NestJS + PG เป็น default template
- Always-on (no cold starts) — manifest endpoint responsive
- Postgres add-on 1-click, backups automatic
- Predictable bill (resource-based not request-based)
- Docker support — same image works locally + production

**Cons**
- ⚠️ No free tier (trial $5 credit, then paid)
- ⚠️ Single region (us-west by default) — Bangkok users latency ~200ms cold
- ⚠️ Multi-region requires manual setup
- ⚠️ Smaller community vs Vercel

**Setup**
```bash
# 1. railway.app → login → New Project
# 2. Click "Deploy from GitHub" → select np-commerce-os
# 3. Set service root: apps/api
# 4. Add Postgres plugin (one click)
# 5. Railway auto-detects pnpm + builds via Nixpacks
# 6. Add env vars
```

**ราคารวมต่อเดือน** (estimate)
- 1 API service @ 512MB RAM + 0.5 vCPU = ~$5/mo
- 1 PG service @ 1GB storage = ~$5/mo
- Total: **~$10/mo** (predictable, no scaling surprises)

### 3.4 Fly.io — Detailed

**Pros**
- **Multi-region native** — รัน VM ที่ Singapore (sin) → ~30ms latency Bangkok ✨
- 3 shared-cpu-1x VMs ฟรี (256MB RAM each)
- Fly Postgres ฟรี (3 GB shared)
- True container deploy (full control)

**Cons**
- ⚠️ Steeper learning curve (need Dockerfile, fly.toml)
- ⚠️ Operational depth — need to understand volumes, scaling, machines
- ⚠️ Free PG ไม่ HA — production ต้อง upgrade

**Setup**
```bash
# 1. flyctl install
brew install flyctl
# 2. Create Dockerfile + fly.toml
# 3. fly launch (interactive)
# 4. fly postgres create
# 5. fly deploy
```

**ราคารวมต่อเดือน** (estimate)
- Free tier: 3 VMs + 3GB PG = **$0** (cap on resources)
- Paid: 1 shared-cpu @ 1GB RAM + PG = **~$8-15/mo**

### 3.5 Self-Hosted (Hetzner + Coolify)

**Pros**
- **ถูกสุด** — Hetzner CX22 €4/mo (4 vCPU + 8GB RAM + 80GB SSD)
- Coolify = self-hosted Heroku (free OSS)
- Full control + no lock-in
- Can host API + PG + Redis + Meili ในเครื่องเดียว

**Cons**
- ❌ Ops burden — คุณดูแล OS updates, backups, security patches, monitoring
- ❌ No auto-SSL renewal (Caddy/Traefik ช่วยได้แต่ต้อง config)
- ❌ ไม่มี DDoS protection (Cloudflare proxy ช่วยได้)
- ❌ Single point of failure — server down = API down

**Setup**
```bash
# 1. ซื้อ Hetzner CX22 (€4/mo, Helsinki/Nuremberg/Falkenstein/Ashburn)
# 2. SSH + install Coolify (5 min installer)
# 3. Coolify UI → connect GitHub → deploy
# 4. Coolify spins up PG container alongside
```

**ราคารวมต่อเดือน**
- Hetzner CX22 = €4 = **~$4.50/mo**

## 4) Recommendation

### Primary: **Railway** สำหรับ Phase 19 (production rollout)

เหตุผล

- ✅ ใช้เวลา setup น้อย (10 นาที) — เร็วสุดในกลุ่ม "always-on"
- ✅ ไม่มี cold start — Capacitor app เปิดที 200-400ms p50 latency
- ✅ Postgres add-on 1-click พร้อม backup auto
- ✅ Predictable bill ($10-15/mo total) — ไม่กลัว surprise จาก traffic
- ✅ Docker-based → migration ไป Fly/self-host ง่ายในอนาคต
- ✅ Pricing scale linearly กับ resource ไม่ใช่ traffic = ทำนายต้นทุนได้

### Alternative: **Vercel + Neon** ถ้าอยากอยู่ใน Vercel ecosystem

- ถ้า user base ใหญ่แล้ว (>5k DAU) → Vercel เริ่มถูกกว่า (per-request scaling)
- ถ้าวันนี้แค่ launch + 100-500 beta users → Railway ถูกกว่า

### NOT recommended ตอนนี้

- ❌ Fly.io — steep learning curve ในขณะที่เร่งทำ Phase 18-19
- ❌ Render — free tier sleep หลัง 15 นาที = manifest call cold start ทุกครั้ง (UX แย่)
- ❌ Self-host — ops burden ใหญ่เกินไปสำหรับช่วง launch

## 5) Implementation Plan (Railway)

### Step 1 — Sign up + connect repo (manual, 5 นาที)

1. railway.app → Sign up with GitHub (npcreate987)
2. New Project → "Deploy from GitHub repo" → `npcreate987/np-commerce-os`
3. Railway auto-detects pnpm monorepo
4. **Service root**: ตั้งเป็น `apps/api`
5. **Start command**: `pnpm start` (production)
6. **Build command**: `pnpm install --frozen-lockfile && pnpm --filter api prisma:generate && pnpm --filter api build`

### Step 2 — Add Postgres (1 click)

1. ใน Railway project → "+ New" → Database → PostgreSQL 16
2. Railway auto-creates env var `DATABASE_URL` + injects into API service
3. Backup คอนฟิก: enabled by default daily

### Step 3 — Set env vars (manual)

ใน Railway service settings → Variables → bulk import

```
# Core
NODE_ENV=production
PORT=${{ PORT }}                    # Railway injects

# Database (auto by Railway)
DATABASE_URL=${{ POSTGRES.DATABASE_URL }}

# Auth (generate fresh for prod)
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
ARGON2_PEPPER=<openssl rand -hex 32>

# Sentry (from .env.local)
SENTRY_DSN=<server DSN — different from web>
SENTRY_ENVIRONMENT=production

# OTA Live Updates (placeholder — bumped by webhook)
LIVE_UPDATES_VERSION=0.0.0
LIVE_UPDATES_BUILD_ID=initial
LIVE_UPDATES_BUNDLE_URL=
LIVE_UPDATES_CHECKSUM=
LIVE_UPDATES_BUNDLE_SIZE_BYTES=0
LIVE_UPDATES_MIN_NATIVE_VERSION=1.0.0
LIVE_UPDATES_ROLLOUT_PCT=0
LIVE_UPDATES_PAUSE=0
LIVE_UPDATES_POLL_INTERVAL_SEC=21600

# OTA webhook (for CI to PATCH manifest)
LIVE_UPDATES_WEBHOOK_SECRET=<openssl rand -hex 32>

# CORS allowlist (comma-separated; required ใน prod — fallback dev regex disabled)
WEB_ORIGIN=capacitor://localhost,https://localhost,ionic://localhost,https://np-commerce.pages.dev,https://main.np-commerce.pages.dev

# Strict migrations (default true in production — process exits on failure)
STRICT_MIGRATIONS=true
```

### Step 4 — Database migrations

Railway runs `pnpm start` after build. But Prisma migrations need to run BEFORE start. 2 options

**Option A**: Pre-start hook in `package.json`

```json
"start": "prisma migrate deploy && node dist/main"
```

**Option B**: Separate "deploy command" in Railway (Settings → Deploy → "Pre-deploy command")

```
pnpm --filter api prisma migrate deploy
```

แนะนำ Option B เพราะแยก concern + Railway show migration logs ชัด

### Step 5 — Verify deployment

```bash
# Get Railway-assigned URL
RAILWAY_URL=https://np-commerce-api-production.up.railway.app

# Health check
curl -s "$RAILWAY_URL/health" | jq

# OTA manifest (should return placeholder values from env)
curl -s "$RAILWAY_URL/v1/app/live-updates/manifest?platform=ios&nativeVersion=1.0.0" | jq
```

### Step 6 — Custom domain (optional, ภายหลัง)

Railway → Settings → Networking → Custom Domain

- ถ้ามี domain แล้ว → add `api.your-domain.com` + add CNAME ใน DNS
- ถ้ายัง → ใช้ `*.up.railway.app` ก่อนได้

### Step 7 — Wire up GitHub Actions webhook

หลังจาก API deployed + LIVE_UPDATES_WEBHOOK_SECRET set แล้ว

```bash
# ตั้ง 3 secrets เพิ่มใน GitHub Actions
gh secret set API_URL --body "https://np-commerce-api-production.up.railway.app" --repo npcreate987/np-commerce-os
gh secret set API_DEPLOY_HOOK_URL --body "https://np-commerce-api-production.up.railway.app/v1/app/live-updates/webhook" --repo npcreate987/np-commerce-os
gh secret set API_DEPLOY_HOOK_SECRET --body "<value of LIVE_UPDATES_WEBHOOK_SECRET>" --repo npcreate987/np-commerce-os
```

ต่อจากนี้ — เวลา `mobile-live-update.yml` รัน + บรรลุ R2 upload → จะ POST webhook → API update env (in-memory cache) → manifest endpoint serve ค่าใหม่ทันที

### Step 8 — Capacitor app point to production API

```bash
# apps/web/.env.production (or set via Vercel/host env)
NEXT_PUBLIC_API_URL=https://np-commerce-api-production.up.railway.app
NEXT_PUBLIC_LIVE_UPDATE_MANIFEST_URL=https://np-commerce-api-production.up.railway.app/v1/app/live-updates/manifest
```

แล้ว rebuild bundle + trigger `mobile-live-update.yml` ใหม่ → bundle ใหม่จะ ship ค่า production URL ลง devices

## 6) Code changes needed before deploy

### 6.1 Add webhook endpoint (NEW — must build)

ปัจจุบัน `apps/api/src/common/live-updates.controller.ts` มีแค่ `GET /manifest`. ต้องเพิ่ม

```ts
@Post('webhook')
@HttpCode(200)
async webhook(
  @Headers('x-np-signature') signature: string,
  @Body() body: WebhookPayload,
) {
  const expected = computeHmacSha256(JSON.stringify(body), process.env.LIVE_UPDATES_WEBHOOK_SECRET);
  if (`sha256=${expected}` !== signature) {
    throw new UnauthorizedException('Invalid HMAC signature');
  }
  // store in in-memory cache + optionally persist to DB
  this.cache.update(body);
  return { ok: true, applied: body.buildId };
}
```

### 6.2 Add in-memory cache override (NEW)

Manifest endpoint reads from cache first, falls back to env vars

```ts
private readonly cache = new LiveUpdatesCacheService();

@Get('manifest')
manifest(...) {
  const override = this.cache.get();
  const version = override?.version ?? process.env.LIVE_UPDATES_VERSION;
  // ...
}
```

Note: in-memory cache resets on service restart. สำหรับ persistence ระยะยาว ต้อง persist เข้า DB (1 table `LiveUpdatesConfig`) — แนะนำทำใน Phase 19.1 หลัง smoke test pass

### 6.3 Health check endpoint (NEW)

Railway + monitoring tools ต้อง `/health` 200

```ts
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
```

### 6.4 CORS for mobile + landing (use WEB_ORIGIN env)

`apps/api/src/main.ts` มี CORS resolver ที่ env-driven อยู่แล้ว — ถ้า `WEB_ORIGIN` set
จะใช้ explicit allowlist; ถ้าไม่ set จะ fallback dev regex (LAN + `capacitor://` +
`ionic://`).

ใน production ต้องตั้ง

```
WEB_ORIGIN=capacitor://localhost,https://localhost,ionic://localhost,https://np-commerce.pages.dev,https://main.np-commerce.pages.dev
```

ไม่ต้องแก้โค้ด — แค่ set env var ใน Railway ใน Step 3

**Note**: ปัจจุบัน Capacitor WebView ใช้ scheme `capacitor://` (iOS) และ
`https://localhost` (Android WebView with `androidScheme: https`). ทั้งคู่อยู่ใน
allowlist ข้างบนแล้ว

## 7) Pre-flight checklist (ก่อนกด deploy)

- [ ] Railway account created
- [ ] Repo connected ใน Railway
- [ ] Service root = `apps/api`
- [ ] Postgres add-on linked
- [ ] Webhook endpoint added (section 6.1)
- [ ] In-memory cache service added (section 6.2)
- [ ] Health controller added (section 6.3)
- [ ] CORS verified ใน main.ts (section 6.4)
- [ ] Env vars set (section Step 3)
- [ ] Pre-deploy command = `pnpm --filter api prisma migrate deploy`
- [ ] First deploy attempted + Railway URL captured
- [ ] Health check 200
- [ ] Manifest endpoint returns placeholder
- [ ] Set 3 GitHub secrets (API_URL, API_DEPLOY_HOOK_URL, API_DEPLOY_HOOK_SECRET)
- [ ] Trigger mobile-live-update workflow → webhook should fire
- [ ] Verify manifest endpoint serves the new bundle metadata

## 8) Cost estimate (Phase 19 — Railway path)

| Item | Cost | Notes |
|------|------|-------|
| Railway API service (~512MB) | ~$5/mo | always-on, predictable |
| Railway Postgres (~1GB) | ~$5/mo | backups included |
| R2 storage (Phase 18 — already set up) | $0 | free tier 10GB |
| Cloudflare Pages (Phase 18 — landing) | $0 | unlimited free |
| Sentry (Phase 13.1 / 18) | $0 | dev tier 5k events/mo |
| **Total Phase 19 add** | **~$10/mo** | + AppleDev $99/yr (Phase 1d) + Play $25 once (Phase 1a) |

## 9) Risk register

| Risk | Mitigation |
|------|------------|
| Railway region (US) high latency Bangkok | Acceptable for launch; migrate to Fly Singapore in Phase 20 if user complaints |
| In-memory cache lost on Railway restart | Add DB persistence in Phase 19.1; current impact = clients see env-var values until next webhook |
| Webhook HMAC compromised | Rotate `LIVE_UPDATES_WEBHOOK_SECRET` quarterly via Railway + GitHub Actions |
| Prisma migration fails in prod | Always run `prisma migrate deploy` separately from start; check Railway build logs |
| DB backup loss | Railway daily backup auto + export weekly to R2 via cron (Phase 19.2) |
| CORS misconfigured → mobile blocked | Test manually after each release using `curl -I -H 'Origin: capacitor://localhost'` |

## 10) Sequence diagram — Full OTA loop (post-Phase 19)

```
Dev                  CI (GH Actions)         R2                   API (Railway)         Capacitor app
 │                         │                  │                         │                       │
 │ git push tag live-v1.0.5│                  │                         │                       │
 │────────────────────────>│                  │                         │                       │
 │                         │ pnpm build       │                         │                       │
 │                         │ zip + sha256     │                         │                       │
 │                         │ aws s3 cp ───────>                         │                       │
 │                         │                  │ 200 OK (immutable URL)  │                       │
 │                         │ POST /webhook ──────────────────────────────>                       │
 │                         │  X-NP-Signature: sha256=...                │                       │
 │                         │  body: {channel, version, url, checksum...} │                      │
 │                         │                                            │ verify HMAC ✓         │
 │                         │                                            │ cache.update()        │
 │                         │ <─ 200 {ok, applied: buildId}              │                       │
 │                         │                                            │                       │
 │                         │                                            │                       │
 │                                                                      │   ← every 6h ←         │
 │                                                                      │ GET /manifest?...     │
 │                                                                      │ ← cache.get()          │
 │                                                                      │ {updateAvailable:true,│
 │                                                                      │  url, checksum, ... } │
 │                                                                      │──────────────────────>│
 │                                                                      │                       │ ← download zip from R2 ← 
 │                                                                      │                       │
 │                                                                      │                       │ Capacitor: verify sha256
 │                                                                      │                       │ Capacitor: stage + reload
 │                                                                      │                       │ User sees new UI ✨
```

## 11) Future enhancements (Phase 19.x)

- **19.1** — Persist webhook payload to DB (`LiveUpdatesConfig` table) + read from DB in manifest (survives restart)
- **19.2** — Weekly Postgres backup to R2 via cron
- **19.3** — A/B testing — store user `experimentBucket` to serve different bundles per cohort  
- **19.4** — Beta channel UI in settings (user-opt-in to beta bundles)
- **19.5** — Add Redis caching layer for high-RPS endpoints (catalog, search)
- **19.6** — Migrate to Fly.io with Singapore region (Bangkok latency)
- **19.7** — Self-hosted Hetzner backup deployment (DR site)

---

## TL;DR สำหรับคนรีบ

1. ไปสมัคร railway.app
2. Deploy from GitHub repo `npcreate987/np-commerce-os`, root = `apps/api`
3. Add PostgreSQL plugin
4. Set env vars (section Step 3)
5. Add 3 endpoints to code (section 6.1-6.3)
6. Push commit → Railway auto-deploys
7. Set 3 GitHub secrets (API_URL, API_DEPLOY_HOOK_URL, API_DEPLOY_HOOK_SECRET)
8. Trigger `mobile-live-update.yml` → full OTA loop activates

**Time**: ~2 ชั่วโมงต่อเนื่อง (Railway setup 30 นาที + code work 1 ชม. + verify 30 นาที)
**Cost**: ~$10/เดือน
**Unblocks**: Day 4 Sentry smoke + Apple/Play app submission (Phase 18 Day 5)
