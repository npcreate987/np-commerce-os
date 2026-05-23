# NP Commerce OS — Operations Runbook

> Operator-first reference for keeping the API alive, healthy, and reasonably safe.
> Pair with `docs/structure-and-deploy.md` (the architectural overview) and
> `docs/prd.md` (the spec).
> Last updated: **2026-05-23** (Phase 13 — Production Hardening).

---

## 0. Quick reference

```
API health        GET  /v1/health                 → { status: "ok", ts }
Prometheus        GET  /v1/metrics                → text/plain
Metrics JSON      GET  /v1/metrics/json           → row counts + uptime
Admin portal      https://<web>/admin             → Risk / Reviews / Chat
Login (admin)     admin@np.dev / <ADMIN_PASSWORD>
Backup            bash scripts/db-backup.sh
Tail logs         <orchestrator>-specific (PM2 / Docker / Railway)
Request trace     every response carries x-request-id; same id appears in logs
```

---

## 1. Architecture at a glance

```
Browser/PWA ──HTTPS──▶ Next.js Web (port 3000)
                          │ (Sentry browser)
                          │
                       SSR/RSC
                          │
                          ▼
                NestJS API (port 3001)
                  ├─ Fastify (logs to stdout, req IDs)
                  ├─ Sentry (Phase 13.1a, optional)
                  ├─ Prometheus metrics (Phase 13.1d)
                  ├─ Global throttler (Phase 13.3a)
                  ├─ Refresh tokens (Phase 13.3b)
                  ├─ Payment adapter (Phase 13.4: mock | omise)
                  └─ In-process cron jobs (Phase 10.x)
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
   Postgres /          S3 / R2           External APIs
   SQLite               (storage)        (FCM, LINE, Omise, …)
```

All cron jobs run **inside the API process** as `setInterval`s. Scaling beyond
one API instance requires either a leader-election library or accepting
duplicate sweep work (most sweepers are idempotent; see §4).

---

## 2. Daily / weekly / monthly checklist

### Daily (≈ 15 min)
- [ ] `curl /v1/health` → `200`
- [ ] `/admin` dashboard — note any HIGH tile counts
- [ ] `/admin/chat` (filter "รอเจ้าหน้าที่") — pick up bot handoffs
- [ ] `/admin/reviews` — hide spam reviews/photos
- [ ] `/admin/ai-ops` — fail rate < 5%?
- [ ] `/admin/events` — confirm event counts climbing (Phase 10.1 firehose alive)

### Weekly (≈ 30 min)
- [ ] `/admin/search` — add catalog for zero-result queries
- [ ] `/admin/risk/*` — freeze HIGH-risk shops if needed
- [ ] `SELECT status, COUNT(*) FROM notification_logs WHERE createdAt > datetime('now','-7 days') GROUP BY status;` — see if any channel is silently failing
- [ ] Disk usage of DB / S3 bucket (set provider alerts if possible)
- [ ] Tail logs for `[bootstrap] migration failed`, `taste rebuild: fail=` patterns

### Monthly
- [ ] Rotate `JWT_SECRET` (all sessions force re-login)
- [ ] Rotate `S3_*` keys
- [ ] Rotate `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
- [ ] Rotate `OMISE_SECRET_KEY` (and webhook secret) — coordinate with Opn
- [ ] Audit `/admin/risk/logistics` — drop carriers with > 30% late rate
- [ ] Review `user_events` size vs `EVENT_RETENTION_DAYS`

### Before every deploy
- [ ] Grep startup log for `[bootstrap] migration failed` → STOP if present
- [ ] `[bootstrap-phaseN] migration complete` line for every phase 2…13
- [ ] `/v1/health` 200 on the new build
- [ ] No bump in `np_model_runs_24h{outcome="fail"}` post-deploy
- [ ] `STRICT_MIGRATIONS=true` is set in prod env (fails fast on bad DDL)

---

## 3. Health probes & metrics

### Liveness — `/v1/health`
```json
{ "status": "ok", "ts": "2026-05-23T09:41:02.172Z" }
```

### Prometheus — `/v1/metrics`
Returns text/plain (`version=0.0.4`) suitable for any Prometheus-compatible
scraper (Grafana Cloud, VictoriaMetrics, Uptime Kuma, etc.). Key series:

| Metric | Type | Labels | What |
|--------|------|--------|------|
| `np_process_uptime_seconds` | gauge | — | seconds since process start |
| `np_process_memory_rss_bytes` | gauge | — | OS-reported RSS |
| `np_process_memory_heap_used_bytes` | gauge | — | V8 heap used |
| `np_db_table_rows` | gauge | `table` | rows per audit table (users / orders / products / video_posts / user_events / storage_uploads / notification_logs / proactive_nudges) |
| `np_notifications_24h` | counter | `status` | SENT / FAIL / SKIPPED in last 24h |
| `np_model_runs_24h` | counter | `outcome` | ok / fail in last 24h |
| `np_user_events_24h` | counter | — | firehose events in last 24h |
| `np_proactive_nudges_24h` | counter | — | nudges fired in last 24h |

### JSON shape — `/v1/metrics/json`
Same data, dictionary shape. Handy for simple uptime monitors that just check
"is the metric value increasing?".

### Suggested alerts (Grafana Cloud / Better Stack / Healthchecks)
```promql
# API down
absent(np_process_uptime_seconds)

# Cron stalled (no events in 12h)
rate(np_user_events_24h[1h]) == 0

# Notification channel broken (>50 fails in last 24h)
np_notifications_24h{status="FAIL"} > 50

# AI calls failing > 10%
np_model_runs_24h{outcome="fail"} / (np_model_runs_24h{outcome="ok"} + np_model_runs_24h{outcome="fail"}) > 0.10

# RSS exploding
np_process_memory_rss_bytes > 1_500_000_000
```

---

## 4. Cron / scheduled jobs

All workers are in-process. Single API replica is the sane default.

| Worker | Cadence | First run | Kill switch | What it does |
|--------|---------|-----------|-------------|--------------|
| `TasteWorkerService` | `TASTE_TICK_MS` (30 s) | +15 s | `TASTE_WORKER_DISABLED=true` | Rebuild dirty user_profiles from firehose queue |
| `ProactiveCronService` (6 sweeps) | 4–24 h staggered | +5–25 min | `PROACTIVE_SWEEPS_DISABLED=true` (+ per-sweep) | Browse-abandon / cart-abandon / win-back / fav-shop-new / price-drop / price-snapshot |
| `EventsRetentionService` | 6 h | +60 s | `EVENT_RETENTION_DISABLED=true` | Purge `user_events` older than `EVENT_RETENTION_DAYS` |
| `ReviewReminderService` | 1 h (`REVIEW_REMINDER_INTERVAL_MS`) | +30 s | `REVIEW_REMINDER=off` | Notify customers to leave reviews 72–168 h after DELIVERED |

Kill switches are env vars — set, restart API, verify they no longer log.

Manual trigger for proactive sweeps (no need to wait the cron):
```
POST /v1/admin/proactive/sweep/browse-abandon   (admin JWT)
POST /v1/admin/proactive/sweep/cart-abandon
POST /v1/admin/proactive/sweep/win-back
POST /v1/admin/proactive/sweep/fav-shop-new
POST /v1/admin/proactive/sweep/price-drop
POST /v1/admin/proactive/snapshot
```

---

## 5. Database

### Where it lives
- **Dev / current workspace** — SQLite at `apps/api/prisma/prisma/dev.db` (via `DATABASE_URL=file:./prisma/dev.db`)
- **Prod target** — PostgreSQL 16; switch `provider = "postgresql"` in `apps/api/prisma/schema.prisma` and update `DATABASE_URL`

### Migrations
Every API boot runs `bootstrap-phase2.ts … bootstrap-phase13.ts` sequentially.

| Behaviour | Default | Override |
|-----------|---------|----------|
| `NODE_ENV=production` | **exits on failure** | `STRICT_MIGRATIONS=false` to soft-fail |
| `NODE_ENV=development` | logs + continues | `STRICT_MIGRATIONS=true` to fail hard |

Tables added per phase are documented in each `bootstrap-phaseN.ts` header.

### Backups — `scripts/db-backup.sh`
Auto-detects driver from `DATABASE_URL`. Cron suggestion:
```cron
15 2 * * *  /app/scripts/db-backup.sh >> /var/log/np-backup.log 2>&1
```
Env vars consumed:
| Env | Purpose | Default |
|-----|---------|---------|
| `DATABASE_URL` | Source | — (required) |
| `BACKUP_DIR` | Local output dir | `./backups` |
| `BACKUP_DRIVER` | Force `pg` or `sqlite` | auto-detected |
| `BACKUP_S3_BUCKET` | Upload destination | — (skip upload) |
| `BACKUP_S3_PREFIX` | Key prefix | `db-backups` |
| `BACKUP_LOCAL_RETAIN` | Keep N newest local | 30 |
| `S3_ENDPOINT` | R2 / non-AWS S3 | — |

Exit codes: `0` ok · `1` config error · `2` tool failed · `3` upload failed (local copy preserved).

### Common SQL playbook

```sql
-- 1) Slowest model_runs in last 24h
SELECT kind, COUNT(*) AS n, AVG(durationMs) AS avg_ms, MAX(durationMs) AS p100_ms
FROM model_runs
WHERE createdAt > datetime('now','-1 day')
GROUP BY kind ORDER BY avg_ms DESC;

-- 2) Notifications failing by channel
SELECT channel, status, COUNT(*) AS n
FROM notification_logs
WHERE createdAt > datetime('now','-7 days')
GROUP BY channel, status
ORDER BY channel, status;

-- 3) Cart abandon backlog (proactive)
SELECT kind, COUNT(*) AS pending
FROM proactive_nudges
WHERE createdAt > datetime('now','-7 days')
GROUP BY kind;

-- 4) Live refresh tokens (sessions outstanding)
SELECT COUNT(*) AS live_sessions
FROM refresh_tokens
WHERE revokedAt IS NULL AND expiresAt > datetime('now');

-- 5) Top failing search queries (zero results)
SELECT query, COUNT(*) AS hits
FROM search_queries
WHERE resultCount = 0 AND createdAt > datetime('now','-30 days')
GROUP BY query ORDER BY hits DESC LIMIT 30;

-- 6) Storage bucket usage by purpose
SELECT purpose, COUNT(*) AS files, SUM(sizeBytes) AS bytes
FROM storage_uploads
WHERE status = 'CONFIRMED'
GROUP BY purpose;
```

---

## 6. Payments

### Adapter selection (`PAYMENT_PROVIDER`)
| Value | Behaviour |
|-------|-----------|
| `auto` (default) | Use `omise` if `OMISE_SECRET_KEY` set, else fall back to `mock` |
| `omise` | Force Omise. Boot warns & falls back to `mock` if key missing |
| `mock` | Force mock — dev only |

`GET /v1/payments/config` returns `{ provider, ready, methods }` so the FE
can render the right checkout UI.

### Webhook
```
POST /v1/payments/webhook/omise    # production: signature-checked
POST /v1/payments/webhook/mock     # staging: any JSON body accepted
```

Omise body example:
```json
{
  "object": "event",
  "id": "evt_5y...",
  "key": "charge.complete",
  "data": { "object": "charge", "id": "chrg_5y...", "status": "successful", "amount": 12500 }
}
```
Header `x-omise-signature` must equal `HMAC-SHA256(rawBody, OMISE_WEBHOOK_SECRET)` in hex.

### Idempotency
Every accepted event is recorded in `payment_webhook_events` keyed by
`(provider, providerEventId)`. Retries return `{ ok: true, deduped: true,
settled: <bool> }` and skip side-effects. Settlement runs `PaymentService.settle`
once per order — wallet escrow, local rider dispatch, and loyalty earn all
short-circuit if the order is already PAID.

### Onboarding Omise (one-time)
1. Create live account at https://opn.ooo / https://omise.co
2. Take `pkey_live_…` + `skey_live_…` from dashboard → set `OMISE_PUBLIC_KEY` / `OMISE_SECRET_KEY`
3. Add webhook URL: `https://<api>/v1/payments/webhook/omise`, copy the webhook secret → `OMISE_WEBHOOK_SECRET`
4. Set `PAYMENT_PROVIDER=omise` (or leave `auto`)
5. Restart API, watch log: `[PaymentService] payment adapter = omise`
6. Test once with a small PromptPay charge in test mode (`skey_test_…`) before going live

---

## 7. Authentication & sessions

### Tokens
- **Access token**: 1h JWT (`JWT_ACCESS_TTL`, override allowed)
- **Refresh token**: 30d single-use (`REFRESH_TTL_DAYS`)
- **Grace window**: 60s (`REFRESH_ROTATION_GRACE_SEC`) — repeat callers within this window get the same successor, prevents race lockouts

### Endpoints
```
POST /v1/auth/signup      → AuthResponse { user, accessToken, refreshToken, expiresInSec }
POST /v1/auth/login       → AuthResponse
POST /v1/auth/refresh     → AuthResponse (rotates)
GET  /v1/auth/me          → User
```

### Throttling
| Endpoint | Window | Cap | Key |
|----------|--------|-----|-----|
| `POST /auth/signup` | 60 s | 5 | IP |
| `POST /auth/login` | 60 s | 10 | IP + body.email |
| `POST /auth/refresh` | 60 s | 30 | IP |
| `POST /notifications/test` | 60 s | 6 | IP |
| `POST /payments/webhook/:provider` | 60 s | 120 | IP |

429 responses include `{ statusCode: 429, message, retryAfterSec }`.

### Admin account
- Default email: `admin@np.dev`
- Default password: **`password123`** (dev only — bootstrap **refuses** to seed
  this in `NODE_ENV=production`)
- Override via `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars **before first boot**

### Reuse detection
If a refresh token is presented **after** it has already been rotated AND the
grace window has expired, AuthService treats this as token theft:
- All sessions for that user are revoked (`refresh_tokens.revokeReason='reuse'`)
- The presenter gets a 401 `refresh token reused`
- User must re-login

Log line to watch: `refresh token reuse detected for user=<id>`.

---

## 8. Observability

### Sentry
Set `SENTRY_DSN` to enable.

| Layer | Init file | Notes |
|-------|-----------|-------|
| API | `apps/api/src/common/observability/sentry.ts` (called from `main.ts` before NestFactory) | 5xx HttpExceptions + unhandled exceptions go to Sentry with request URL + reqId tag |
| Web (server) | `apps/web/instrumentation.ts` | Auto-loaded by Next.js 14 (`experimental.instrumentationHook=true`) |
| Web (browser) | `apps/web/sentry.client.config.ts` | Auto-loaded by `@sentry/nextjs` |

Traces are sampled at 0 by default (`SENTRY_TRACES_SAMPLE_RATE` to enable).

### Request IDs
- Every request gets `x-request-id` (incoming honoured if present, else UUID).
- Header echoed in the response so users can paste their request id in support tickets.
- Sentry events carry `request_id` tag.
- Search a Fastify access log line by it.

### Structured logging
Fastify default pino-style JSON to stdout. Nest `Logger` instances log
free-form text. No log aggregation is wired by default — pipe stdout from your
orchestrator (Railway/Fly/Docker logs).

---

## 9. Storage (S3 / R2 / MinIO)

| State | Behaviour |
|-------|-----------|
| `S3_ACCESS_KEY` blank | Driver = `mock`; URLs are `<APP_URL>/uploads/<key>` (404s in browser) |
| Keys set, R2 endpoint | Driver = `r2`, path-style |
| Keys set, MinIO endpoint | Driver = `minio`, path-style |
| Keys set, empty endpoint | AWS S3 virtual-hosted |

Per-purpose limits enforced server-side:
- review_photo / product_media / cs_attachment — 8 MB images
- shop_logo — 4 MB images
- video — 100 MB mp4/webm/quicktime
- video_thumb — 2 MB images

`GET /v1/storage/config` returns the full matrix so the FE can pre-validate
before triggering an upload.

R2 setup checklist:
1. Create bucket (`wrangler r2 bucket create np-commerce`)
2. API token w/ Object Read & Write on the bucket
3. CORS allowing browser PUT from web origins:
   ```json
   [{
     "AllowedOrigins": ["http://localhost:3000","https://app.np-commerce.com"],
     "AllowedMethods": ["GET","PUT","HEAD"],
     "AllowedHeaders": ["*"],
     "MaxAgeSeconds": 3600
   }]
   ```
4. Set `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_PUBLIC_BASE` (CDN/custom domain → bucket)
5. Restart API; expect log `storage driver: r2 → https://cdn…`

---

## 9.5 Video moderation (Phase 12.2)

Surface for the support team to triage user-generated videos.

### Object lifecycle

```
ACTIVE      ← default after upload (visible in /feed)
  │
  ├─ user reports it ─► REPORTED      (hidden from /feed; visible to author + admin queue)
  │                       │
  │                       ├─ admin RESTORE ► ACTIVE   (resolution=KEEP)
  │                       ├─ admin HIDE    ► HIDDEN   (resolution=HIDE; visible to author only)
  │                       └─ admin DELETE  ► DELETED  (resolution=DELETE; bucket cleanup)
  │
  ├─ admin HIDE   ► HIDDEN
  └─ author DELETE ► DELETED   (bucket cleanup + open reports auto-resolve)
```

`video_posts.status` is the single source of truth. `video_reports` is an
append-only ledger — even after a video is deleted, the report rows remain
with `resolution='DELETE'` for audit.

### Admin URLs

| URL                          | Surface                                                 |
|------------------------------|---------------------------------------------------------|
| `/admin/videos` (tab: คลิป)   | All videos with `pendingReports` + filter pills         |
| `/admin/videos` (tab: รายงาน) | Flat report queue (PENDING by default, refresh 30 s)    |

### API surface

```
GET    /v1/feed/mine                          # JWT — owner: includes HIDDEN/REPORTED
POST   /v1/feed/:id/report  {reason, note?}   # JWT, throttle 10/h
GET    /v1/feed/admin/all?status=&onlyReported=  # JWT+Admin
GET    /v1/feed/admin/reports?status=         # JWT+Admin
PATCH  /v1/feed/admin/:id/moderate  {action,note?}  # JWT+Admin
```

Throttle for `POST /v1/feed` is **20/hour/user** (bot guard).

### Bucket cleanup

`DELETE` from author OR admin invokes `StorageService.deleteByUrl(videoUrl)` +
`deleteByUrl(thumbUrl)`. Failures are logged (`Logger.warn`) but never propagate —
the row state remains authoritative.

In **mock storage mode** (`S3_ACCESS_KEY` blank) the delete is a no-op against
the bucket; only the `storage_uploads.status` row is updated to `'DELETED'`.

### Daily check (≈ 2 min)

```bash
# Open queue depth — anything > 0 deserves attention
curl -s "$API/v1/feed/admin/reports?status=PENDING" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq 'length'

# Or via /v1/metrics:
curl -s $API/v1/metrics/json | jq '.tables.video_reports'
```

### Common SQL

```sql
-- Top reported videos in last 7 days
SELECT v.id, v.caption, COUNT(*) AS reports
  FROM video_reports r JOIN video_posts v ON v.id=r.videoId
  WHERE r.createdAt > datetime('now','-7 days')
  GROUP BY v.id ORDER BY reports DESC LIMIT 20;

-- Resolution breakdown last 30 days
SELECT resolution, COUNT(*) FROM video_reports
  WHERE resolvedAt > datetime('now','-30 days') GROUP BY resolution;

-- Repeat offenders (authors with ≥3 hidden/deleted videos)
SELECT authorId, COUNT(*) FROM video_posts
  WHERE status IN ('HIDDEN','DELETED') GROUP BY authorId HAVING COUNT(*)>=3;
```

### Adding a moderator

1. Create the user via normal signup.
2. `UPDATE users SET role='ADMIN' WHERE email='moderator@np.dev';`
3. They get the "วิดีโอ" tab in `/admin` immediately on next login.

---

## 10. Notifications

Adapter pattern in `apps/api/src/modules/integration/adapters/`. When env vars
are missing, the adapter returns `isReady()=false` and `dispatchOne()` writes a
`notification_logs.status = SKIPPED` row — never throws to callers.

| Adapter | Env to enable | Skip reason when absent |
|---------|---------------|-------------------------|
| InApp | always on | n/a |
| WebPush | `WEB_PUSH_VAPID_*` + `web-push` npm dep | `no-vapid` / `lib-missing` |
| FCM | `FCM_SERVICE_ACCOUNT_JSON` or legacy `FCM_SERVER_KEY` | `no-config` / `no-token` |
| APNs | `APNS_KEY_*` + `APNS_TEAM_ID` + `APNS_TOPIC` | `no-config` / `lib-missing` |
| Email | `EMAIL_API_KEY` (Resend) or `SMTP_*` | `no-config` / `no-email` |
| LINE | `LINE_ACCESS_TOKEN` | `no-token` / `not-linked` |

Audit table: `notification_logs(userId, channel, status, error, payload, createdAt)`.

---

## 11. Kill-switches (full inventory)

```
# Crons
TASTE_WORKER_DISABLED               PROACTIVE_SWEEPS_DISABLED
EVENT_RETENTION_DISABLED            REVIEW_REMINDER=off
PROACTIVE_BROWSE_ABANDON_DISABLED   PROACTIVE_CART_ABANDON_DISABLED
PROACTIVE_WIN_BACK_DISABLED         PROACTIVE_FAV_SHOP_NEW_ARRIVAL_DISABLED
PROACTIVE_PRICE_DROP_DISABLED       PROACTIVE_PRICE_SNAPSHOT_DISABLED

# AI / LLM
LLM_RERANK_ENABLED=false      LLM_PROVIDER=none|openai|anthropic
CHATBOT_ENABLED=false

# Migrations
STRICT_MIGRATIONS=true        # default in prod

# Payments
PAYMENT_PROVIDER=mock         # force mock even if Omise key set

# Storage
(unset S3_ACCESS_KEY)         # falls back to mock URLs
```

---

## 12. Incident playbook

### "API is down"
1. Check `/v1/health`. If timeout → orchestrator (Railway / Fly / Docker) shows process state
2. If process restart-looping → tail logs for `[bootstrap] migration failed` (STRICT_MIGRATIONS in prod will exit)
3. If process up but 5xx everywhere → check Sentry / `/v1/metrics` for `np_db_table_rows` (does it look right?)
4. Rollback if recent deploy: redeploy previous tag

### "Notifications stopped"
1. `SELECT channel, status, COUNT(*) FROM notification_logs WHERE createdAt > datetime('now','-1 day') GROUP BY channel, status;`
2. If `FAIL` only on one channel → adapter credentials expired (FCM / APNs / Resend)
3. If all `SKIPPED` → kill switch left on, env var lost
4. Test channel: login as admin → `POST /v1/notifications/test` → check returned per-channel statuses

### "Customer says they were charged but order still PENDING"
1. Find payment row: `SELECT * FROM payments WHERE orderId = '...';`
2. If `provider='omise'` and `providerRef` exists → query Omise dashboard for that charge
3. If charge succeeded but webhook never landed → manually fire settlement:
   ```
   POST /v1/payments/webhook/mock
   { "providerRef":"<the chrg_xxx>", "status":"SUCCEEDED",
     "amountCents":<amount>, "eventId":"manual_<timestamp>" }
   ```
   (works because settle() looks up by providerRef regardless of provider)
4. Verify webhook URL in Omise dashboard is still correct (HTTPS cert valid, no 4xx in recent deliveries)

### "Suspicious admin login"
1. `SELECT * FROM refresh_tokens WHERE userId = '<admin-id>' ORDER BY createdAt DESC LIMIT 20;`
2. If any unexpected `createdAt` → revoke all sessions:
   ```sql
   UPDATE refresh_tokens SET revokedAt = datetime('now'), revokeReason='admin'
   WHERE userId = '<admin-id>' AND revokedAt IS NULL;
   ```
3. Reset admin password — set new `ADMIN_PASSWORD` env var, restart API (bootstrap-phase6 picks it up on existing admin record)
4. Rotate `JWT_SECRET` to invalidate every outstanding access token in the platform

### "Storage uploads succeed but URLs 404"
1. Likely R2/S3 key rotated and old presigned URLs (10 min TTL) have expired
2. Check `S3_PUBLIC_BASE` env still points at correct CDN/custom domain
3. Browser fetch the public URL directly — if 404, bucket misconfigured (CORS or bucket renamed)

### "Disk filling up"
1. `/v1/metrics/json` → check `events` count
2. If `EVENT_RETENTION_DISABLED=true` accidentally → re-enable; cron purges within 6h
3. Manually purge if urgent:
   ```sql
   DELETE FROM user_events WHERE ts < datetime('now','-60 days');
   DELETE FROM model_runs WHERE createdAt < datetime('now','-90 days');
   DELETE FROM payment_webhook_events WHERE receivedAt < datetime('now','-30 days');
   ```

---

## 13. Open hardening work (post-Phase 13)

These remain as known gaps — none blocks GA but each is a risk reducer.

- [ ] **Logout endpoint** — `POST /v1/auth/logout` revokes the presented refresh token only (one-device logout). `POST /v1/auth/logout-all` revokes every refresh token for the user.
- [ ] **PII redaction in stdout logs** — currently emails/names appear in request body logs at debug level
- [ ] **Webhook raw-body retention** — Fastify re-stringifies JSON before HMAC; works for both providers we support but switch to `@fastify/raw-body` before adopting a 4th gateway
- [ ] **HSTS / CSP headers** — set at the Web layer (`apps/web/middleware.ts`) or edge (Cloudflare WAF rule)
- [ ] **PgBouncer** when multi-instance — Prisma pool size × replicas must stay under DB max_connections
- [ ] **Leader election for cron** when multi-instance (or extract a separate `worker` Nest app)
- [ ] **Rate-limit Redis backing** — current in-memory bucket resets on restart
- [ ] **Refresh-token cleanup** for deleted users (cascade revoke on `users.delete`)
- [ ] **Webhook replay attack window** — Omise events older than 5 minutes should probably be rejected even if signature matches (currently no time check)

---

## 14. Where to look in the code

| Topic | File |
|-------|------|
| Bootstrap pipeline | `apps/api/src/main.ts` |
| Sentry init | `apps/api/src/common/observability/sentry.ts` |
| Metrics endpoint | `apps/api/src/common/observability/metrics.controller.ts` |
| Health endpoint | `apps/api/src/common/health.controller.ts` |
| Global exception filter | `apps/api/src/common/exceptions/all-exceptions.filter.ts` |
| Throttle guard | `apps/api/src/common/throttle/throttler.ts` |
| Auth + refresh | `apps/api/src/modules/auth/auth.service.ts` |
| Payment adapter contract | `apps/api/src/modules/payment/adapters/types.ts` |
| Omise adapter | `apps/api/src/modules/payment/adapters/omise.adapter.ts` |
| Payment service settlement | `apps/api/src/modules/payment/payment.service.ts` |
| Webhook receiver | `apps/api/src/modules/payment/payment.controller.ts` |
| Phase 13 migration | `apps/api/src/bootstrap-phase13.ts` |
| Backup script | `scripts/db-backup.sh` |
| Env reference | `.env.example` (top of repo) |
| Web Sentry | `apps/web/instrumentation.ts` + `apps/web/sentry.client.config.ts` |
