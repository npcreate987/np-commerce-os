# Project Structure & Deployment Guide

> สถาปัตยกรรมโดยรวม + วิธีรัน dev / build / deploy / ออก native app
> อัปเดต: Phase 10.3 (Proactive Surfaces) — 2026-05-22

---

## 1. Bird's-eye View

```
np-commerce-os/                         monorepo root (pnpm + turborepo)
├── apps/
│   ├── api/                            NestJS + Fastify backend
│   │   ├── src/
│   │   │   ├── main.ts                 bootstrap + runtime migrations
│   │   │   ├── app.module.ts           root module — wires every feature module
│   │   │   ├── bootstrap-phaseN.ts     idempotent raw-SQL migrations (one per phase)
│   │   │   ├── common/                 PrismaService, ZodPipe, TF-IDF, model-runs, AI log
│   │   │   ├── shared/types/           type mirror of @np/types (for tsc rootDir)
│   │   │   └── modules/
│   │   │       ├── auth/               JWT (+ OptionalJwtAuthGuard for anon telemetry)
│   │   │       ├── user/  catalog/  shop/  cart/  checkout/  order/
│   │   │       ├── payment/  wallet/  loyalty/  coupon/  referral/
│   │   │       ├── logistics/  rider/  local/                 ◀ phase 4-5
│   │   │       ├── review/  dispute/  risk/                   ◀ phase 7
│   │   │       ├── search/  feed/  creator/  campaign/        ◀ phase 8
│   │   │       ├── insights/  recommendation/  aiops/         ◀ phase 6
│   │   │       ├── integration/  notification/  broadcast/    ◀ phase 9.1
│   │   │       ├── storage/                                   ◀ phase 9.2
│   │   │       ├── chat/                                      ◀ phase 9.3
│   │   │       ├── events/                                    ◀ phase 10.1
│   │   │       ├── taste/                                     ◀ phase 10.2
│   │   │       ├── proactive/                                 ◀ phase 10.3
│   │   │       └── merchant/                                  merchant admin endpoints
│   │   └── prisma/                     schema.prisma + seed.ts
│   │
│   └── web/                            Next.js 14 (App Router) + PWA + Capacitor
│       ├── src/
│       │   ├── app/                    file-system router
│       │   │   ├── (customer)/         feed, search, cart, checkout, orders, profile, …
│       │   │   ├── (merchant)/         shop dashboard, products, orders, marketing, …
│       │   │   ├── (admin)/            admin console (chat, events, ops, KYC, …)
│       │   │   ├── (creator)/          creator studio + payouts
│       │   │   ├── (rider)/            rider app
│       │   │   ├── (auth)/             login / signup / forgot
│       │   │   ├── apply-creator/  apply-rider/
│       │   │   └── r/[code]/page.tsx   referral landing
│       │   ├── components/             UI primitives + product-card, chat-widget, …
│       │   ├── lib/                    api.ts (typed SDK), track.ts (10.1 firehose),
│       │   │                           track-hooks.ts, push.ts, upload.ts, cn.ts, env.ts
│       │   └── stores/                 zustand stores (auth, cart, …)
│       ├── public/
│       │   ├── manifest.webmanifest    PWA install metadata
│       │   ├── sw.js / sw-push.js      service worker + push handler
│       │   └── icons/                  PWA + Capacitor app icons
│       ├── capacitor.config.ts         iOS/Android wrap config
│       └── next.config.mjs
│
├── packages/
│   ├── types/                          @np/types — Zod schemas + TS types (single source of truth)
│   ├── sdk/                            (future) typed REST client for external consumers
│   ├── ui/                             (future) shared component library
│   └── config/                         (future) shared eslint / tsconfig
│
├── infra/
│   ├── docker/docker-compose.dev.yml   Postgres 16 + Redis 7 + Meilisearch + MinIO
│   ├── k8s/                            (placeholder for prod manifests)
│   └── terraform/                      (placeholder for cloud IaC)
│
├── docs/                               architecture / decisions / flows / phase notes
├── scripts/                            convenience restart scripts
├── turbo.json                          turbo task pipeline
├── pnpm-workspace.yaml                 workspace definition
└── Agent.md                            agent operating guide (READ FIRST)
```

### Why this layout?
- **Single TypeScript repo, no submodules** — every change to types touches
  exactly one file (`packages/types`) and propagates instantly to web + api
  via workspace links.
- **`apps/api/src/shared/types/` mirrors `@np/types`** — NestJS `tsc` builds
  cleaner when every source is inside one `rootDir`. The mirror is the same
  Zod schemas re-exported; never diverge intentionally.
- **No DAO/repo layer** — services use Prisma + raw SQL (`$queryRawUnsafe`)
  directly. Trade off: faster iteration, no abstraction premium; cost: must
  hand-write parameterised queries. Worth it at this stage.
- **Runtime migrations via `bootstrap-phaseN.ts`** — every phase adds tables
  with `CREATE TABLE IF NOT EXISTS` executed on boot. We don't depend on
  Prisma migrations alone; this lets us ship features without a separate
  migration step in CI.
- **Modular monolith now → microservices later** — Nest's module boundaries
  are already drawn around future extraction points (payment, logistics,
  search, etc.) but we run as one process.

---

## 2. Tech Stack Summary

| Layer            | Tech                                             | Why                                      |
|------------------|--------------------------------------------------|------------------------------------------|
| Runtime          | Node.js 20 LTS                                   | LTS, native fetch, stable AsyncLocalStorage |
| Package manager  | pnpm 9                                           | workspaces, fast, deterministic           |
| Monorepo tasks   | Turborepo                                        | cache, parallel pipeline                  |
| Web              | Next.js 14 App Router + Tailwind                 | PWA-ready, RSC, native dynamic routes     |
| API              | NestJS 10 + Fastify                              | DI, modules, fast HTTP, OpenAPI-ready     |
| Auth             | JWT (passport-jwt) + argon2                      | stateless, mobile-friendly, OWASP-aligned |
| DB (dev)         | **SQLite** (Prisma file://)                      | zero infra, fast feature iteration        |
| DB (prod target) | Postgres 16                                      | switch via `DATABASE_URL`; raw SQL is portable |
| ORM              | Prisma                                           | schema + client, but we mostly use `$queryRawUnsafe` |
| Cache (planned)  | Redis 7                                          | rate limits, session, queues              |
| Search (planned) | Meilisearch                                      | typo-tolerant Thai, replace fallback grep |
| Object storage   | S3-compatible (R2 / MinIO / Wasabi / B2)         | adapter pattern, SigV4 self-signed        |
| AI               | Optional OpenAI / Anthropic via direct REST       | no SDK lock-in, env-gated                 |
| Native           | Capacitor 6                                      | wraps the same web build → iOS/Android    |
| Push             | Web Push (VAPID) + FCM + APNs                    | platform-native delivery via adapters     |
| Observability    | `model_runs` table + Logger                      | replaceable with OpenTelemetry later      |

---

## 3. Local Development

### 3.1 First-time setup
```bash
# 1. Tooling
nvm use                # picks Node 20 from .nvmrc
npm i -g pnpm@9        # if not already

# 2. Workspace
pnpm install           # links workspaces, installs everything

# 3. Bring up databases / caches / search
docker compose -f infra/docker/docker-compose.dev.yml up -d

# 4. Prisma client + seed
pnpm --filter api prisma:generate
pnpm --filter api seed       # optional — bootstraps demo data

# 5. Env
cp .env.example .env         # tweak as needed
```

### 3.2 Run both apps
```bash
pnpm dev                     # turbo runs api (3001) + web (3000) in parallel
# or run them separately
pnpm dev:api
pnpm dev:web
```

API runtime migrations execute on boot (`apps/api/src/main.ts`) — no manual
DDL step required for SQLite dev.

### 3.3 Test from your phone (same Wi-Fi)
```bash
# 1. Find your Mac/PC LAN IP, e.g. 192.168.1.42
# 2. Set in apps/web/.env.local:
NEXT_PUBLIC_API_URL=http://192.168.1.42:3001
# 3. Bind dev to 0.0.0.0
WEB_HOST=0.0.0.0 WEB_PORT=3000 pnpm dev:web
# 4. On phone, open http://192.168.1.42:3000 and "Add to Home Screen"
```

### 3.4 Workspace cheat-sheet
```bash
pnpm typecheck                              # turbo run typecheck (all)
pnpm --filter api typecheck                 # api only
pnpm --filter web typecheck                 # web only
pnpm --filter api build                     # nest build → dist/
pnpm --filter web build                     # next build → .next/
pnpm --filter web build:static              # static export → out/ (Capacitor)
pnpm --filter api seed                      # run prisma/seed.ts
```

---

## 4. Environment Variables Checklist

Always copy from `.env.example`. Below is the **production hot list** — what
absolutely must be set, by category.

### 4.1 Core (always required)
```bash
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASS@HOST:5432/np_commerce
JWT_SECRET=<>=32-char random>
JWT_REFRESH_SECRET=<another 32-char random>
CORS_ORIGIN=https://app.example.com,https://admin.example.com
API_PORT=3001
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_APP_URL=https://app.example.com
```

### 4.2 Phase 9.1 Notifications (only enable what you ship)
| Channel    | Vars                                                                   |
|------------|------------------------------------------------------------------------|
| Web Push   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`               |
| FCM        | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`                |
| APNs       | `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`    |
| Email      | `RESEND_API_KEY` **or** `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS`        |
| LINE       | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LIFF_ID`                            |

### 4.3 Phase 9.2 Storage (pick one provider)
| Provider   | Vars                                                                   |
|------------|------------------------------------------------------------------------|
| Cloudflare R2 | `S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_BASE` |
| AWS S3     | same vars, real region (e.g. `ap-southeast-1`)                          |
| MinIO (dev)| `S3_ENDPOINT=http://localhost:9000`, `S3_FORCE_PATH_STYLE=true`         |

### 4.4 Phase 9.3 / 10.2 LLM (optional)
```bash
LLM_PROVIDER=openai                                 # or "anthropic" or "none"
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=...
ANTHROPIC_CHAT_MODEL=claude-3-5-haiku-latest
LLM_RERANK_ENABLED=false                            # phase 10.2 ranker rerank
```

### 4.5 Phase 10 Tuning
```bash
EVENT_RETENTION_DAYS=180        # raw firehose retention
TASTE_WINDOW_DAYS=30
TASTE_HALF_LIFE_DAYS=14
TASTE_TICK_MS=30000             # taste worker tick
PROACTIVE_SWEEPS_DISABLED=false # phase 10.3 master switch
```

---

## 5. Deployment Options (Pick a Lane)

### Lane A — "Get-live-this-weekend" (Vercel + Railway/Render + R2)
**Best for:** small team, want managed everything, willing to pay $25-50/mo.

| Component     | Service                                  | Notes                                   |
|---------------|------------------------------------------|-----------------------------------------|
| Web           | Vercel (Next.js native)                  | Auto preview deploys, edge CDN          |
| API           | Railway / Render / Fly.io                | Long-lived process, sticky for cron     |
| DB            | Neon / Supabase / Railway Postgres       | Managed Postgres 16 with backups        |
| Object store  | Cloudflare R2                            | S3-compatible, no egress fee            |
| Push (Web)    | VAPID self-hosted                        | Just env vars on the API box            |
| Push (FCM/APNs)| Firebase + Apple Developer              | Free for FCM, $99/yr Apple              |
| Email         | Resend                                   | 3k/mo free, dead-simple REST            |
| Domain        | Cloudflare                               | DNS + SSL + Bot Fight                   |

Deploy steps:
1. Push monorepo to GitHub.
2. Vercel project → root: `apps/web`, build: `pnpm build:web`, env vars from §4.
3. Railway service → root: `apps/api`, start: `pnpm --filter api start`,
   add Postgres add-on, env vars from §4.
4. Configure custom domains (`app.example.com` → Vercel, `api.example.com`
   → Railway).
5. R2 bucket → CORS allow your origins → S3_* env vars on API.

### Lane B — "Single VPS" (cheap, you own everything)
**Best for:** hobbyist / launching MVP for THB 200/mo.

```
  ┌─────────────────────────────────────────────┐
  │  Hetzner / DigitalOcean / Vultr (4GB, 2vCPU) │
  │                                               │
  │  ┌─────────┐  ┌────────┐  ┌─────────────┐    │
  │  │ nginx   │→ │ next   │  │ nest (api)  │    │
  │  │ (443/80)│  │ :3000  │  │  :3001      │    │
  │  └─────────┘  └────────┘  └─────────────┘    │
  │                                               │
  │  ┌─────────┐  ┌────────┐  ┌─────────────┐    │
  │  │ postgres│  │ redis  │  │ minio       │    │
  │  └─────────┘  └────────┘  └─────────────┘    │
  └─────────────────────────────────────────────┘
```

Steps:
1. Provision Ubuntu 24.04, `apt install nginx postgresql nodejs npm` (use
   nodesource for Node 20).
2. Clone repo, `pnpm install`, build:
   ```bash
   pnpm --filter api build
   pnpm --filter web build
   ```
3. Use **PM2** (or systemd) to keep them up:
   ```bash
   pm2 start "node apps/api/dist/main.js" --name api
   pm2 start "node apps/web/node_modules/.bin/next start -p 3000" --name web
   pm2 save && pm2 startup
   ```
4. nginx reverse proxy + Let's Encrypt (certbot):
   ```nginx
   server {
     server_name app.example.com;
     location / { proxy_pass http://127.0.0.1:3000; }
   }
   server {
     server_name api.example.com;
     location / { proxy_pass http://127.0.0.1:3001; }
   }
   ```
5. Daily DB backup: `pg_dump | gzip > /backup/np-$(date +%F).sql.gz`.

### Lane C — Containerised (Docker → any platform)
**Best for:** future-proofing, multi-region, want one image to ship anywhere.

We don't ship `Dockerfile`s yet (TBD in Phase 11+), but the shape is:
```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
RUN npm i -g pnpm@9 && pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter api prisma:generate && pnpm --filter api build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app .
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
```
For the web side, prefer `pnpm --filter web build` + `next start` in a similar
multi-stage build. Push to any registry (GHCR, ECR, Docker Hub) and deploy to
ECS / Fly Machines / Cloud Run / K8s.

---

## 6. Database Strategy

### Today (dev): SQLite via Prisma `file:./dev.db`
- Zero ops; instant iteration; bootstrap-phaseN scripts execute on boot.
- Will fall over above ~few hundred concurrent writes/sec.

### Production: Postgres 16
1. `DATABASE_URL=postgresql://...` — Prisma client switches automatically.
2. The raw SQL in `bootstrap-phaseN.ts` and modules uses portable syntax
   (no SQLite-only `datetime('now','-1 days')` would need: see §6.1).
3. Run `pnpm --filter api prisma:migrate deploy` ONCE per release to apply
   any schema additions Prisma manages; runtime bootstrap scripts continue
   to handle additive `CREATE TABLE IF NOT EXISTS` work.
4. Backups: enable provider-side daily backups + WAL archiving for PITR.
5. Read replicas: when ingest path (`/events/batch`) becomes hot, point
   `EventsService` reads at a replica via a second Prisma client.

### 6.1 SQLite → Postgres porting checklist
| Pattern                              | SQLite                       | Postgres                              |
|--------------------------------------|------------------------------|---------------------------------------|
| Current timestamp                    | `CURRENT_TIMESTAMP`          | same                                  |
| Date arithmetic                      | `date('now','-7 days')`      | `now() - interval '7 days'`           |
| `datetime('now','-1 days')`          | as-is                        | `now() - interval '1 day'`            |
| Upsert                               | `INSERT … ON CONFLICT DO`    | identical                             |
| JSON column                          | TEXT                         | `JSONB` (free perf upgrade)           |

A single `db/sql-dialect.ts` helper is on the backlog (Phase 11+) — for now,
prefer Postgres-portable phrasing in NEW raw queries.

---

## 7. PWA → Native App

Capacitor is already configured (`apps/web/capacitor.config.ts`).

### 7.1 Bundle the web build into native shells
```bash
pnpm --filter web build:static        # produces apps/web/out/
pnpm --filter web cap:sync            # copies out/ into iOS/Android projects
```

### 7.2 First-time iOS
```bash
pnpm --filter web cap:add:ios         # creates apps/web/ios/
pnpm --filter web cap:open:ios        # opens Xcode
# In Xcode: set Team, Bundle ID app.np.commerce, then Archive → Distribute
```

### 7.3 First-time Android
```bash
pnpm --filter web cap:add:android     # creates apps/web/android/
pnpm --filter web cap:open:android    # opens Android Studio
# In AS: Build → Generate Signed Bundle → AAB → upload to Play Console
```

### 7.4 Live-reload dev on a real device
```bash
WEB_HOST=0.0.0.0 pnpm dev:web                              # phone & Mac same Wi-Fi
CAP_SERVER_URL=http://192.168.1.42:3000 pnpm --filter web cap:dev:ios
# (or cap:dev:android)
```

---

## 8. CI / CD (Recommended)

We don't ship workflow files yet, but the proven shape is:

```yaml
# .github/workflows/ci.yml (TODO)
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm --filter api test
      - run: pnpm --filter web build
```

For deploys, prefer **branch-driven**:
- `main` → production (Vercel + Railway/Render auto-deploy on push)
- `staging` → staging env
- PR → ephemeral preview (Vercel preview URLs)

---

## 9. Observability Hooks Already in Place

Most heavy operations are already instrumented; just hook up a dashboard.

| Signal                                       | Source                                     |
|----------------------------------------------|--------------------------------------------|
| AI / heavy-query timings                     | `model_runs` table (`measured()` wrapper)  |
| Notification deliveries                       | `notification_logs` table                  |
| Behavioural firehose volume                   | `user_events` + `/v1/events/stats` admin   |
| Proactive nudges sent                         | `proactive_nudges` + cron log lines        |
| Chatbot turns                                 | `model_runs` kind=`chatbot.turn`            |
| Storage upload audit                          | `storage_uploads` + status                  |

Recommended add-ons later:
- OpenTelemetry + Grafana Tempo for traces
- Pino + Loki/Elastic for logs
- Sentry for error reporting (just `SENTRY_DSN` + a tiny wrapper)

---

## 10. Pre-launch Checklist (Phase 10.3 baseline)

- [ ] Postgres + Redis provisioned; `DATABASE_URL` set
- [ ] R2/S3 bucket created + CORS allows web origin
- [ ] VAPID keys generated (`web-push generate-vapid-keys` → env)
- [ ] FCM service account JSON + APNs key uploaded to env
- [ ] Resend API key (or SMTP) verified with sending domain DNS
- [ ] LINE channel access token (optional)
- [ ] OpenAI / Anthropic key set if `LLM_PROVIDER` ≠ `none`
- [ ] `JWT_SECRET` + `JWT_REFRESH_SECRET` are 32+ random chars
- [ ] `CORS_ORIGIN` lists every legitimate frontend host
- [ ] `EVENT_RETENTION_DAYS` matches your privacy policy
- [ ] `PROACTIVE_SWEEPS_DISABLED=false` (or true for staging)
- [ ] Backups configured + tested restore at least once
- [ ] Web Build: `pnpm --filter web build` succeeds
- [ ] API Build: `pnpm --filter api build` succeeds
- [ ] Smoke test: signup → login → add to cart → checkout → see proactive
      bar populated → open chat from PDP → bot greets with product context

---

## 11. Common Gotchas

1. **Prisma client out of sync** — run `pnpm --filter api prisma:generate`
   after every `schema.prisma` change; the runtime bootstrap scripts handle
   raw tables but Prisma-typed tables need the client regenerated.
2. **Web build OOM** — Next.js can balloon RAM on big repos; add
   `NODE_OPTIONS=--max-old-space-size=4096` to CI.
3. **Chat widget shows nothing** — likely `JWT_SECRET` mismatch between API
   and the issuer of the token in localStorage; clear local storage.
4. **Push not arriving** — Web Push needs HTTPS (or localhost); FCM needs
   service account JSON parsed correctly (newlines in private key are the
   #1 footgun — keep `\n` escaped).
5. **Proactive sweeps not firing** — they wait 5-25min after boot for the
   first run; check `PROACTIVE_*_DISABLED` env and the API logs for the
   `proactive-cron` lines.
6. **Capacitor cap:sync says "no web-dir"** — you forgot `BUILD_STATIC=true`
   on the prior next build.

---

## 12. Where to Read Next

- `Agent.md` — what the codebase looks like phase-by-phase, with the
  *"why"* for every architectural decision.
- `docs/roadmap.md` — what's done, what's next, with backlog per phase.
- `docs/architecture.md` — high-level architecture diagram + rationale.
- `docs/modules/` — per-feature deep dives (search, payments, etc.).
- `docs/decisions/` — short ADRs for big tech choices.
- `docs/flows/` — sequence diagrams for the messy multi-actor flows
  (checkout, dispute, payout, etc.).
