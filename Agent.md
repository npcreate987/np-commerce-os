# Agent.md — NP Commerce OS

> ไฟล์นี้คือ "คู่มือกำกับ AI Agent" ของโปรเจ็กต์
> ทุกครั้งที่ Agent (Cursor / Claude / ChatGPT / Codex / ฯลฯ) เริ่มทำงานในโปรเจ็กต์นี้
> ต้องอ่านไฟล์นี้ก่อนเสมอ แล้วจึง "วางโครงสร้าง" สิ่งที่จะทำ ก่อนจะลงโค้ดจริง

---

## 0. กฎทองของโปรเจ็กต์ (Golden Rules)

ก่อนทำงานทุกครั้ง Agent ต้อง:

1. **อ่าน text สเปกในเอกสารก่อน** (`docs/overview.md` + ไฟล์โมดูลที่เกี่ยวข้อง)
2. **วางโครงสร้างก่อนเขียนโค้ด**
   - บอกว่าจะแก้/สร้างไฟล์อะไรบ้าง
   - บอก data flow
   - บอก dependency ที่ต้องเพิ่ม
3. **คำนึงถึงมือถือเป็นอันดับแรก (Mobile-First)**
   - ทุก UI ต้อง responsive ตั้งแต่ 360px
   - ทุก feature ต้องใช้งานบนมือถือได้
   - ต้อง build ลงมือถือได้ผ่าน PWA (`installable`, `offline-ready`, `add to home screen`)
4. **เขียนภาษาไทย/อังกฤษผสมได้** แต่ identifier ในโค้ดเป็นภาษาอังกฤษเท่านั้น
5. **ห้ามทำลายงานเก่า** ถ้าจะ refactor ให้ทำ ADR ใหม่ใน `docs/decisions/`
6. **อัปเดต Agent.md / roadmap** เมื่อโครงสร้าง/เฟสเปลี่ยน

---

## 1. โปรเจ็กต์คืออะไร (สรุปสั้น)

**NP Commerce OS** = ระบบ Commerce กลางสำหรับร้านค้าออนไลน์ ร้านท้องถิ่น Creator และลูกค้า

แนวคิด: ใช้ TikTok / Social Media เป็นช่องทางดึงลูกค้า แต่ให้ "ระบบของเรา" เป็นศูนย์กลางในการ:

- ปิดการขาย
- รับชำระเงิน (Escrow)
- เก็บ Data ลูกค้า
- จัดการขนส่ง (ไม่ผูกขาด)
- คุ้มครองผู้ซื้อ (NP Protect)
- ช่วยร้านค้าทำการตลาดซ้ำ
- ลดการพึ่งพาแพลตฟอร์มเดียว

อ่านสเปกเต็มได้ที่ [`docs/overview.md`](./docs/overview.md)

---

## 2. Tech Stack

| ชั้น | เทคโนโลยี | เหตุผล |
|------|------------|--------|
| Frontend (User-facing) | **Next.js 14 (App Router) + TypeScript** + **PWA** | ใช้โค้ดเดียวรันได้ทั้งเว็บและมือถือ (installable PWA), SSR/ISR ช่วย SEO |
| Mobile | **PWA (installable)** + Capacitor (อนาคต) | "Build ลงมือถือ" ผ่าน PWA ก่อน, ถ้าต้องการ Native API เพิ่มในอนาคตค่อยห่อด้วย Capacitor |
| Styling | **Tailwind CSS** + shadcn/ui | Mobile-first utility framework |
| State | **Zustand** + **TanStack Query** | เบาและ scalable |
| Backend | **NestJS (TypeScript)** | Modular monolith → microservices ในอนาคต |
| Database | **PostgreSQL** (หลัก) + **Redis** (cache/queue) + **MeiliSearch** (search) | OLTP + cache + search ที่ฟรี |
| Storage | **S3-compatible** (MinIO/R2/S3) | สำหรับรูป/วิดีโอสินค้า |
| Realtime | **Socket.IO** หรือ **Pusher** | สำหรับ Rider tracking, แชต, แจ้งเตือน |
| Auth | **Auth.js (NextAuth)** + JWT + OTP (เบอร์โทร) | รองรับลูกค้า/ร้านค้า/Creator/Admin |
| Payment | **Omise / 2C2P / SCB Easy / TrueMoney** | เกตเวย์ที่นิยมในไทย |
| Logistics API | **Shippop / Flash Express API / Kerry / J&T / Grab Express / Lalamove** | ขนส่งหลายเจ้า |
| Infra | **Docker** + **Vercel** (web) + **Railway/Fly.io** (api) → **Kubernetes** (เมื่อโต) | เริ่มเบา ๆ ขยายได้ |
| Monorepo | **Turborepo** + **pnpm workspaces** | เร็ว, share types |
| CI/CD | **GitHub Actions** | ฟรีและพอ |
| Observability | **Sentry** + **Plausible/Umami** | error + analytics |

> เหตุผลของการเลือก stack: ดู [`docs/decisions/0001-tech-stack.md`](./docs/decisions/0001-tech-stack.md)

---

## 3. โครงสร้างโฟลเดอร์ (Project Structure)

```
np-commerce-os/
├── Agent.md                       ← ไฟล์นี้
├── README.md                      ← ภาพรวม + วิธี start
├── package.json                   ← root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json
├── .editorconfig / .gitignore / .nvmrc / .env.example
│
├── apps/
│   ├── web/                       ← Next.js (Customer + Merchant + Creator + Admin) + PWA
│   └── api/                       ← NestJS (REST + GraphQL + WebSocket)
│
├── packages/
│   ├── ui/                        ← shared React components (shadcn/ui based)
│   ├── types/                     ← shared TypeScript types/DTO/Zod schemas
│   ├── sdk/                       ← API client (typed) ใช้ใน apps/web
│   └── config/                    ← shared eslint/prettier/tsconfig
│
├── infra/
│   ├── docker/                    ← docker-compose, Dockerfile ของแต่ละ service
│   ├── k8s/                       ← manifests (เมื่อ scale)
│   └── terraform/                 ← infra-as-code
│
├── scripts/                       ← seed, migrate, codegen, devtools
│
└── docs/
    ├── overview.md                ← สเปกเต็ม
    ├── architecture.md            ← system architecture
    ├── roadmap.md                 ← Phase 1–6
    ├── modules/                   ← เอกสารราย module 13 ไฟล์
    ├── flows/                     ← user flow / data flow
    └── decisions/                 ← ADR (Architecture Decision Records)
```

---

## 4. โมดูลทั้งหมด (13 โมดูล)

แต่ละโมดูลมีเอกสารแยกใน `docs/modules/`

| # | โมดูล | เอกสาร | สถานะ |
|---|-------|---------|------|
| 1 | Customer Platform | [01](./docs/modules/01-customer-platform.md) | 🔵 spec |
| 2 | Merchant Platform | [02](./docs/modules/02-merchant-platform.md) | 🔵 spec |
| 3 | Creator / Affiliate Center | [03](./docs/modules/03-creator-affiliate.md) | 🟢 done |
| 4 | Smart Checkout | [04](./docs/modules/04-smart-checkout.md) | 🔵 spec |
| 5 | Payment / Escrow | [05](./docs/modules/05-payment-escrow.md) | 🔵 spec |
| 6 | NP Protect | [06](./docs/modules/06-np-protect.md) | 🔵 spec |
| 7 | NP Logistics Hub | [07](./docs/modules/07-logistics-hub.md) | 🔵 spec |
| 8 | NP Local Commerce | [08](./docs/modules/08-local-commerce.md) | 🟢 done |
| 9 | NP Marketing Engine | [09](./docs/modules/09-marketing-engine.md) | 🟢 done |
| 10 | AI Engine | [10](./docs/modules/10-ai-engine.md) | 🟢 done |
| 11 | Admin Platform | [11](./docs/modules/11-admin-platform.md) | 🔵 spec |
| 12 | Data Layer | [12](./docs/modules/12-data-layer.md) | 🔵 spec |
| 13 | Integration Layer | [13](./docs/modules/13-integration-layer.md) | 🔵 spec |

สถานะ: 🔵 spec → 🟡 in-progress → 🟢 done → 🟣 prod

---

## 5. Roadmap แบบเฟส

ดูเต็มได้ที่ [`docs/roadmap.md`](./docs/roadmap.md) ·
PRD สำหรับการปรับ UX/UI + ไล่ฟังก์ชัน: [`docs/prd.md`](./docs/prd.md) ·
โครงสร้าง + วิธี deploy ดูที่ [`docs/structure-and-deploy.md`](./docs/structure-and-deploy.md)

- **Phase 1 — Core Commerce MVP** 🟢 done
  สมัครร้าน · ลงสินค้า · หน้าสินค้า · Checkout · Payment · Order · Dashboard ร้านค้า
- **Phase 2 — Trust & Logistics** 🟢 done
  Escrow · NP Protect · เลือกขนส่ง · Tracking · Dispute / Refund
- **Phase 3 — Creator / Affiliate** 🟢 done
  Creator สมัคร · ลิงก์ขาย · QR · Commission · Dashboard
- **Phase 4 — Local Commerce** 🟢 done
  ร้านอาหาร/ร้านท้องถิ่น · พิกัด · ส่งด่วน · นัดรับ/นัดส่ง · Rider · Geo search
- **Phase 5 — Marketing Engine** 🟢 done
  Short Video Feed · Coupon · Loyalty · Referral · Broadcast · Flash Deal · Boost
- **Phase 6 — AI Engine** 🟢 done
  For You / Similar / Buy Again · Merchant Insights (KPI, Trend, Top, Anomaly,
  Price suggest, Creator match) · Admin Risk Center (Shop / Order / Logistics)
- **Phase 6.1 — Smarter AI** 🟢 done
  TF-IDF content similarity · Trending (7d/30d surge) · RFM customer segments ·
  `model_runs` telemetry on every AI call
- **Phase 6.2 — AI in Action** 🟢 done
  Demand forecast (μ + DoW seasonality + confidence band) · Segment-aware broadcasts
  (`SEG_CHAMPIONS`/`SEG_LOYAL`/`SEG_NEW`/`SEG_AT_RISK`/`SEG_LOST`) + live audience preview ·
  Admin AI Ops dashboard (latency/p95/fail rate) · Fixed broadcast audience bugs (`userId` → `customerId`)
- **Phase 7 — Reviews & Reputation** 🟢 done
  `reviews` table (1 per order+product, eligibility = DELIVERED) · star + histogram on product page ·
  write form on order detail · merchant avg-rating tile · admin `/admin/reviews` moderation page ·
  fake-review heuristics (SHORT/NEW/DUPLICATE/LOW_EFFORT) · auto-flag at insert ·
  `poor_rating` factor wired into shop risk score
- **Phase 8 — Search & Discovery** 🟢 done
  `search_queries` table · `/v1/search/*` (products with TF-IDF + filters + sorts, shops, suggestions, track) ·
  `/search` page (autocomplete + chip filters + highlight + recents in localStorage + zero-result fallback) ·
  ปุ่มแว่นใน `/feed` + `/local` ใช้งานได้ · admin `/admin/search` (trending 7d + zero-result 30d) ·
  ทุก call ผ่าน `measured()` → ขึ้น AI Ops อัตโนมัติ
- **Phase 9.1 — Real Notifications & Delivery Channels** 🟢 done
  `bootstrap-phase9.ts` (5 ตาราง: push_subscriptions / user_devices / line_links /
  notification_prefs / notification_logs) ·
  `IntegrationModule` adapter pattern (InApp / WebPush(VAPID) / FCM / APNs / Email(Resend+SMTP) / LINE OA) ·
  `NotificationService` facade รองรับ opt-out per channel × topic + concurrency-limited fan-out ·
  `/v1/notifications/*` (config/push/devices/prefs/line/test) ·
  `BroadcastService.send()` รองรับ channel จริง (PUSH/EMAIL/LINE) + ทุก channel เขียน inapp ด้วยเสมอ ·
  Web Push SW (`/public/sw-push.js`) + `lib/push.ts` (subscribe/unsubscribe) ·
  `/profile/notifications` (toggle + เปิด-ปิด push + test + LINE link) ·
  Merchant broadcasts dropdown channel + warning chip ·
  Review reminder cron (3-7 วันหลัง DELIVERED, idempotent via `notification_logs`)
- **Phase 9.2 — Photo Reviews + Storage Layer** 🟢 done
  `bootstrap-phase9-2.ts` (storage_uploads / review_photos / review_helpfuls +
  additive `reviews.helpfulCount`) ·
  `StorageModule` zero-dep SigV4 PUT presigner รองรับ AWS S3 / Cloudflare R2 / MinIO /
  Wasabi (driver auto-detect จาก endpoint) + `mock` driver สำหรับ dev/CI ·
  `/v1/storage/*` (config / presign / confirm) — types/sizes allowlist ·
  ReviewService รับ `photoUploadIds[]` + heuristic `PHOTO_DUPLICATE` (sha256 match)
  + helpful votes (กันโหวตตัวเอง, denormalised count) + admin per-photo `hidePhoto()` ·
  `listForProduct` รับ optional JWT → คืน `helpfulByMe` + `photos[]` + sort by helpfulCount ·
  Web `lib/upload.ts` client-side compress (canvas → WebP/JPEG ≤1600px) +
  SHA-256 hash (Web Crypto API) + presign → PUT → confirm pipeline ·
  WriteReviewForm รับรูปสูงสุด 5 รูป (preview + ลบได้) ·
  ReviewsSection ใหม่: photo gallery + lightbox (‹/› navigation) + helpful pill button
- **Phase 9.3 — CS Chatbot (Conversational Support)** 🟢 done
  `bootstrap-phase9-3.ts` (`chat_conversations` + `chat_messages` พร้อม intent / tool snapshot inline) ·
  `ChatModule` (`bot/intent.ts` + `bot/tools.ts` + `bot/llm.ts`) ·
  Deterministic intent classifier ภาษาไทย+อังกฤษ → เลือก tool: lookup_order /
  list_my_orders / recent_disputes / pending_reviews / policy_info /
  request_human_handoff (ทุก tool เรียกผ่าน OrderService/DisputeService/ReviewService
  เพื่อ enforce authorization) ·
  Optional LLM rephraser (OpenAI หรือ Anthropic ผ่าน REST `fetch` ตรง, ไม่มี SDK dep) —
  เรียบเรียงเฉพาะ FACTS ห้ามแต่งข้อมูลเอง ป้องกัน hallucination ·
  Hand-off lifecycle: BOT → REQUESTED → HUMAN → RESOLVED + admin notify ผ่าน
  `NotificationService` (best-effort) ·
  `/v1/chat/*` (config / conversations / messages / admin list, messages, reply, take-over) ·
  `ChatWidget` floating bubble + suggested-action chips + typing dots + 8s polling ·
  `/admin/chat` filter REQUESTED/HUMAN/ALL + ตอบกลับ + "ปิดเคสหลังตอบ" + "รับเรื่อง" ·
  AI Ops log `model_runs` kind=`chatbot.turn` ทุก turn
- **Phase 10.1 — Behavioural Event Firehose** 🟢 done
  `bootstrap-phase10.ts` (`user_events` append-only + `user_sessions` + `user_consents`) ·
  `EventsModule`: bulk `ingestBatch` (multi-VALUES + dedupe 1-sec window),
  `OptionalJwtAuthGuard` รับ anonymous traffic, `linkAnonToUser` stitch หลัง login,
  `EventsRetentionService` cron purge ทุก 6 ชม. ·
  `ConsentService` cache 30s + `/v1/me/privacy` (GET/PATCH) + `/v1/me/events` (GET/DELETE) ·
  Web `lib/track.ts` (singleton queue, flush 50 events หรือ 5s,
  `navigator.sendBeacon` ตอน pagehide, localStorage anonId + sessionStorage sessionId) ·
  Hooks `useTrackOnce` + `useDwellTracker` (pause เมื่อ hidden, threshold 30s) +
  `useScrollDepth` (75% default) ·
  Wire: PDP (view/dwell/scroll), home/cart `page_view`, checkout `checkout_start` + `purchase`
  per order, search `search_query`, RecommendationStrip `reco_impression`+`reco_click` ·
  `/profile/privacy` (toggle opt-out + retention selector 30/90/180/365/730 + ดู 50 event ล่าสุด + ลบประวัติฉัน) ·
  `/admin/events` KPI 24h byKind/bySurface
- **Phase 10.2 — User Taste Profile + Multi-signal Ranker** 🟢 done
  `bootstrap-phase10-2.ts` (`user_profiles` 1-row-per-user: shopAffinity, tagAffinity,
  priceMedian/Std, recentItemIds[30], boughtItemIds, generation) ·
  `TasteService.rebuildFor()` รวม events 30d × `exp(-age/14d)` decay +
  weights ต่อ kind (purchase 25, add_to_cart 5, dwell 2.5, view 1.0, …) ·
  `TasteWorker` ดึงคิวทุก 30s, concurrency=4 — ไม่บล็อก hot path ของ `/events/batch` ·
  `EventsService.registerIngestListener()` decouple → ฟัง ingest โดยไม่ circular dep;
  `linkAnonToUser` trigger rebuild ทันทีหลัง login ·
  `RecommendationService.forYou2()` blend 5 signals: contentSim 30% (TF-IDF cosine vs
  recency-weighted user vector) + shopAffinity 25% + tagAffinity 20% + priceMatch 10%
  (gaussian รอบ median±std) + popularity 10% + exploration 5% + MMR cap 3/shop;
  reason mapping จาก dominant component (`BECAUSE_VIEWED` / `FAVOURITE_SHOP` /
  `SAME_CATEGORY` / `PRICE_MATCH` / `EXPLORE`) ·
  Optional LLM rerank top-30→top-10 (`LLM_RERANK_ENABLED=true`) ผ่าน OpenAI/Anthropic
  REST direct + hallucination guard (id ต้องอยู่ใน whitelist) + 4s timeout fall-back ·
  Endpoints `/v1/me/taste` (summary), `POST /me/taste/rebuild`, `DELETE /me/taste`,
  `/v1/admin/users/:id/taste`, `/v1/recommendations/for-you/explain` (per-candidate
  breakdown); `/v1/recommendations/for-you` ตอนนี้เรียก `forYou2` (cold-start ตก
  legacy popularity silently) ·
  Web `/profile/privacy` เพิ่มการ์ด "สิ่งที่ระบบเรียนรู้ว่าคุณชอบ" (topShops, topTags,
  budget median, lastUpdated, ปุ่มอัปเดต/รีเซ็ตโปรไฟล์); `RecommendationStrip` เพิ่ม
  `<ReasonBadge>` (👀/⭐/🔥/✨) ตาม reason
- **Phase 10.3 — Proactive Surfaces** 🟢 done

- **Phase 11.1 — UX/UI Foundation + Customer Shell** 🟢 done (2026-05-22)
  Design tokens 2-mode (light/dark CSS vars) · `ThemeProvider` + `ThemeToggle` (system/light/dark, no-flash script) ·
  **CustomerShell** branching: mobile (<lg) ใช้ glass sticky header (logo+search+bell+theme) + bottom-tab 5 ปุ่ม
  (Home/ใกล้ฉัน/Cart/Orders/ฉัน) · desktop (≥lg) ใช้ top bar 64px (logo + horizontal nav + wide search + bell + cart +
  profile + theme) + content max-w-app 1280px ·
  Landing `/` redesign 2-layout (mobile refine, desktop 12-col hero + floating cards + 4-col features) ·
  `/feed` refactor (เอา inline header ออก, desktop 12-col bento + 5-col product grid) ·
  `.container-app` responsive 480→768→1280px · semantic surface utilities (light/dark adaptive) ·
  **Thai typography**: เพิ่ม IBM Plex Sans Thai (body) + Anuphan (display) ผ่าน `next/font/google`,
  line-height/letter-spacing ที่ tuned สำหรับสระและวรรณยุกต์ไทย

- **Phase 12 — TikTok-style Video Feed** 🟢 done (2026-05-23)
  `/feed` ถูกโปรโมตให้เป็น **vertical short-video reel** แบบ TikTok เต็มจอ ·
  สร้าง `apps/web/src/components/video/video-feed.tsx` (reusable primitive) — vertical snap scroll,
  `IntersectionObserver` per `<video>` (ดูเกิน 60% → เล่น, นอกนั้น pause), one-clip-at-a-time playback,
  global mute toggle, tap-to-play/pause, infinite scroll ผ่าน `useInfiniteQuery`
  (โหลด page ถัดไปเมื่อเลื่อนถึง index `N-3`), deep-link `?v=<id>` (scrollIntoView) ·
  Action rail (ขวา): creator avatar + `+` follow badge, like (optimistic mutation + roll-back),
  comment placeholder (v2), bookmark (local-only ตอนนี้), share (`navigator.share` → clipboard fallback),
  spinning music disc ·
  Caption block (ซ้าย-ล่าง): `@author`, ชื่อร้าน, hashtags (parse จาก `tagsJson`), music ticker,
  product CTA pill (ลิงก์ไป `/product/:id`, emit `reco_click`) ·
  Desktop layout: phone frame `max-w-[440px] aspect-[9/16]` ตรงกลาง + side panel ขวา
  (creator info, follow CTA, comments placeholder, stats) ·
  Old commerce home (bento + rails + product grid) ย้ายไป `/feed/shop` —
  bottom nav ปรับเป็น **ฟีด · ช้อป · ตะกร้า · ใกล้ฉัน · ฉัน**,
  top bar เปลี่ยน "คลิป" → "ช้อป" ·
  **Immersive shell**: `CustomerShell` ตรวจ `IMMERSIVE_ROUTES` (`new Set(['/feed'])`) →
  ซ่อน `CustomerMobileHeader`, ซ่อน `ChatWidget`, ตัด `pb-24`, ส่ง `variant="overlay"` ไป
  `CustomerBottomNav` (translucent dark glass) ·
  Tracking: `video_play` (first paint บนแต่ละ clip), `video_complete` (`onEnded`),
  `share` (kind=like/share), `reco_click` (product CTA tap), server `POST /v1/feed/:id/view` ·
  Backward-compat: `/feed/videos[?v=]` → 307 redirect ไป `/feed[?v=]` ·
  Backward-compat สำหรับ z-index: เพิ่ม `z-immersive: 30` ต่ำกว่า `z-bottomnav: 40` เพื่อให้ nav อยู่บน video ·
  **Seed**: `bootstrap-phase12.ts` insert 8 demo clips (ภาษาไทย, public sample mp4s, picsum thumbnails)
  ด้วย deterministic IDs `seed_v12_NN` + `INSERT OR IGNORE` (idempotent ข้าม restart) —
  attach กับ user/shop/product ตัวแรกที่มีใน DB + dedup legacy random-id seeds จาก v1

- **Phase 12.1 — User Video Upload** 🟢 done (2026-05-23)
  ขยาย Storage layer (Phase 9.2) รองรับการอัปคลิปจาก customer ใด ๆ + เปิด composer
  ที่กลาง bottom-nav บน immersive `/feed` ·
  **Types** (`packages/types/src/storage.ts` + mirror ใน api):
  เพิ่ม purpose `'video'`, per-purpose `STORAGE_LIMITS` (video 100 MB · video_thumb 2 MB ·
  อิมเมจ 8 MB · shop_logo 4 MB), ขยาย `storageConfigSchema` ใส่ `limits` + `allowedByPurpose` ·
  **StorageService** (`apps/api/src/modules/storage/storage.service.ts`):
  per-purpose MIME whitelist (`ALLOWED_BY_PURPOSE` — video รับ `video/mp4|webm|quicktime`),
  per-purpose size enforcement (โยน `BadRequestException` พร้อม message ที่อ้าง purpose),
  extend `extFromType` (`.mp4` `.webm` `.mov`); validation รันทั้ง real และ mock driver ·
  **Client helpers** (`apps/web/src/lib/upload-video.ts`):
  `probeVideo()` (อ่าน duration/dimensions ผ่าน `<video preload=metadata>`),
  `extractVideoPoster()` (canvas snapshot 720×1280 object-cover JPEG @ 0.82 ที่ frame 0.5s),
  `uploadVideoFile()` (XHR `upload.onprogress` 0..1 → progress bar — ไม่ compress),
  `uploadVideoPoster()` (presign `video_thumb` purpose), รองรับ mock driver auto-confirm ·
  **Composer** `/feed/create` (`apps/web/src/app/(customer)/feed/create/page.tsx`):
  auth gate (redirect `/login?next=%2Ffeed%2Fcreate` ผ่าน `useEffect`),
  file picker `accept="video/mp4,video/webm,video/quicktime" capture="environment"`
  (เปิดกล้องตรงบนมือถือ), client-side validate: size ≤100 MB → duration ≤90s → MIME,
  preview `<video controls>` ด้วย aspect ที่ probe ได้, caption textarea (≤500),
  chip-input tags (≤10), optional shop selector (auto-pick shop แรกของ merchant) +
  product selector (CTA "ซื้อเลย"), submit pipeline:
  poster → uploadVideo (with progress) → uploadThumb → `api.feed.create` →
  `qc.invalidateQueries(['feed','videos'])` → `router.push('/feed?v=<id>')` ·
  **FAB** (`apps/web/src/components/shell/create-fab.tsx`):
  mobile = vertical circular "+" lifted `bottom: env(safe-area-inset-bottom) + 5.5rem`
  เหนือ overlay bottom nav · desktop = pill "สร้างคลิป" ขวาล่าง · href ปรับตาม `token`
  (logged-out → ตรงไป `/login?next=…`) — render เฉพาะ immersive routes
  (`CustomerShell` แทน `ChatWidget` ในโหมด immersive) ·
  **Env** (`.env.example`): R2 production checklist (CORS allow `PUT`,
  `S3_PUBLIC_BASE` = custom CDN) พร้อม per-purpose limits matrix ·
  Smoke: presign video 5 MB → mock URL OK · reject `image/jpeg` บน purpose video →
  400 "ไม่อนุญาตสำหรับ purpose 'video'" · reject 101 MB → 400 "ใหญ่กว่า 100 MB" ·
  full `presign → feed.create` flow → row `vid_*` ปรากฏที่ `/v1/feed` พร้อม caption ไทย

- **Phase 12.2 — User Video Management + Admin Moderation** 🟢 done (2026-05-23)
  ปิด "good-to-have" gap จาก Phase 12 — ผู้ใช้จัดการคลิปของตัวเอง + รายงานคลิป
  คนอื่นได้, ทีมซัพพอทมีหน้าหลังบ้านสำหรับ moderate · **DB**: `bootstrap-phase12-2.ts`
  สร้าง `video_reports` (id, videoId, reporterId, reason ENUM 7 ชนิด, note, status
  PENDING/RESOLVED, resolvedBy/At/resolution HIDE|KEEP|DELETE) + 3 index +
  UNIQUE-WHERE `(videoId, reporterId) WHERE status='PENDING'` กัน double-report ·
  ขยาย `videoStatusSchema` ใน `packages/types/src/marketing.ts` (+ mirror ใน
  `apps/api/src/shared/types/marketing.ts`) เพิ่ม `'REPORTED'` ระหว่าง ACTIVE/HIDDEN ·
  **Storage**: `StorageService.deleteByObjectKey()` + `deleteByUrl()` + `objectKeyFromUrl()`
  (best-effort URL → key reverse map); ใหม่ `sigv4.deleteObject()` สำหรับ SigV4 DELETE
  request (idempotent — รับ 204/404/200) · safe no-op ในโหมด mock storage ·
  **Feed API**: `FeedService.listMine()` แสดงคลิป "ของฉัน" รวม HIDDEN/REPORTED
  (เจ้าของต้องเห็นว่าโดน moderate); `remove()` ขยายให้ cleanup bucket video+thumb
  แล้ว auto-resolve open reports เป็น 'DELETE'; `report()` กันลบของตัวเอง+ดูแล
  UNIQUE conflict → 409 + auto-flip ACTIVE→REPORTED ครั้งแรก;
  `adminList({status,onlyReported,limit})` พร้อม `pendingReports`/`lastReportReason`
  ในแต่ละแถว; `adminListReports({status,limit})` join video+author+reporter;
  `adminModerate({action: HIDE|RESTORE|DELETE, note})` หน่วยเดียวจบทุก side effect ·
  **Endpoints ใหม่**: `GET /v1/feed/mine` (JWT), `POST /v1/feed/:id/report` (JWT +
  throttle 10/h, Zod refine บังคับ note ถ้า reason=OTHER), `GET /v1/feed/admin/all`
  (JWT+Admin), `GET /v1/feed/admin/reports` (JWT+Admin),
  `PATCH /v1/feed/admin/:id/moderate` (JWT+Admin) · `POST /v1/feed` ตอนนี้ throttle
  20/h ต่อ user กัน upload bot · **Web**: หน้าใหม่ `/profile` (hub ลิงก์ videos/orders/
  notifications/privacy + ปุ่มลัด "เปิดหลังบ้าน" ถ้า role=ADMIN) ·
  `/profile/videos` (grid 9:16, status badge อธิบายว่าโดน moderate, delete ยืนยัน) ·
  `/admin/videos` แท็บ "คลิป" + "รายงานล่าสุด" — filter pills REPORTED/ACTIVE/HIDDEN,
  ปุ่มกด HIDE/RESTORE/DELETE inline, refetchInterval 30s ·
  `apps/web/src/components/video/report-sheet.tsx` bottom-sheet 7 reason +
  textarea (required เมื่อ OTHER), success state + auto-close 1.4s, anon → login CTA ·
  ปุ่ม "เพิ่มเติม" (icon dots) ใน video-feed right rail (ซ่อนเมื่อเป็นเจ้าของคลิป) ·
  bottom-nav "ฉัน" tab ชี้ `/profile` แทน `/profile/privacy` ·
  Smoke (live, end-to-end): author signup → post → /mine status ACTIVE OK · self-report
  → 400 "รายงานคลิปของตัวเองไม่ได้" · reporter report → ok pendingReports=1 ·
  duplicate report → 409 "คุณรายงานคลิปนี้ไปแล้ว" · status auto-flip → REPORTED ·
  public feed hides REPORTED · admin queue พบ pendingReports=1 lastReason='SPAM' ·
  admin reports list join เห็น reporter name + note ไทย · admin HIDE →
  status=HIDDEN + report resolution='HIDE' · non-admin moderate → 403 ·
  author DELETE → soft-delete + bucket cleanup + reports auto-resolve · OTHER reason
  ไม่ใส่ note → 400 Zod refine "กรุณาใส่รายละเอียดเมื่อเลือก 'อื่น ๆ'"

- **Phase 13 — Production Hardening** 🟢 done (2026-05-23)
  เตรียมระบบให้พร้อม expose ให้ user ใช้จริง — ปิด ops gap ทั้งหมดที่ระบุใน
  backend maintenance map (Sentry / backup / refresh tokens / throttle /
  default admin password / payment webhook integrity / runbook) ·
  **13.1 Observability**:
  `apps/api/src/common/observability/sentry.ts` import-first ก่อน `NestFactory`
  เพื่อ patch http/fetch globals; `AllExceptionsFilter` capture 5xx +
  unhandled พร้อม redact `authorization`/`cookie` headers · Fastify
  `genReqId` รับ `x-request-id` ที่เข้ามาหรือ mint UUID; echo กลับใน response
  header + tag เข้า Sentry scope per request · ใหม่:
  `apps/api/src/common/observability/metrics.controller.ts` ออก
  `/v1/metrics` (Prometheus exposition) + `/v1/metrics/json` —
  uptime, RSS/heap, 8 audit tables, notif/model/event/nudge 24h counters ·
  Web: `apps/web/instrumentation.ts` (Next 14 `experimental.instrumentationHook`)
  + `apps/web/sentry.client.config.ts` (browser) · ทุกตัวเป็น no-op เมื่อ
  `SENTRY_DSN` ไม่ตั้ง ·
  **13.2 Migration discipline + Backup**:
  `STRICT_MIGRATIONS` env (default `true` ใน prod) → `process.exit(1)` เมื่อ
  bootstrap-phase ใดล้ม (ก่อนหน้านี้ทำ silent fail) · `scripts/db-backup.sh`
  รองรับ sqlite (`sqlite3 .backup`) และ Postgres (`pg_dump -Fc`),
  optional R2/S3 upload ผ่าน `aws` CLI, retention `BACKUP_LOCAL_RETAIN`,
  exit codes 0/1/2/3 ·
  **13.3 Auth hardening**:
  `apps/api/src/common/throttle/throttler.ts` — sliding-window in-memory
  rate limiter พร้อม `@Throttle({windowSec,max,keyBy})` decorator + global
  `ThrottleGuard` (no-op เมื่อไม่ติด decorator); apply: signup 5/min/IP,
  login 10/min/IP+email, refresh 30/min/IP, /notifications/test 6/min,
  /payments/webhook/:provider 120/min · ใหม่: `refresh_tokens` table
  (Phase 13 migration) + `POST /v1/auth/refresh` single-use rotation พร้อม
  60s grace window (concurrent racing clients ได้ successor ตัวเดียวกัน
  แทน lock-out); reuse beyond grace → revoke ALL sessions for user (theft
  defence) · `JWT_ACCESS_TTL` ลดเหลือ `1h` (จาก 7d), refresh `REFRESH_TTL_DAYS=30` ·
  `bootstrap-phase6.ts` อ่าน `ADMIN_EMAIL`/`ADMIN_PASSWORD` env; refuse
  boot ใน `NODE_ENV=production` ถ้ายังใช้ default `password123`; non-prod
  warn ดัง ·
  `POST /v1/notifications/test` → admin-only + throttle 6/min ·
  **13.4 Payment adapter pattern**:
  `apps/api/src/modules/payment/adapters/{types,mock,omise}.adapter.ts` —
  `PaymentAdapter` interface `{ id, isReady, createCharge, verifyWebhook }`;
  `PaymentService` constructor เลือก adapter ตาม `PAYMENT_PROVIDER`
  (`auto|omise|mock`), fallback mock ถ้า Omise key ไม่ครบ · OmiseAdapter
  ใช้ native `fetch` ไม่ผูก SDK (POST /sources → /charges) สำหรับ PromptPay,
  webhook HMAC-SHA256 verify (`x-omise-signature` ⊕ `OMISE_WEBHOOK_SECRET`)
  ด้วย `timingSafeEqual` ·
  `payment_webhook_events` table (Phase 13 migration) — UNIQUE on
  `(provider, providerEventId)`, idempotent retry: ครั้งที่ 2 ตอบ
  `{ deduped: true, settled }` โดยไม่ run side-effects ซ้ำ · ALTER
  `payments` table เพิ่ม `provider`/`providerRef`/`failureMessage`
  columns (PRAGMA-guarded) · `POST /v1/payments/webhook/:provider`
  controller endpoint, raw-body re-stringify (works for JSON gateways) ·
  `GET /v1/payments/config` public endpoint สำหรับ FE checkout ·
  Settlement funnel `PaymentService.settle(orderId)` — เดียวสำหรับทั้ง
  `confirmMock` และ webhook path: wallet escrow, local rider dispatch, loyalty earn ·
  **13.5 Runbook**:
  `docs/operations.md` (~ 450 บรรทัด) — health probes, daily/weekly/monthly
  checklist, Prometheus alert queries, cron table, SQL playbook,
  payment onboarding, incident playbooks (API down / charge mismatch /
  suspicious admin login / disk full), kill switch inventory ·
  Smoke (live): `/v1/health` 200 · `/v1/metrics` Prometheus + JSON ok ·
  signup → AuthResponse w/ refreshToken + expiresInSec=3600 · refresh
  rotates · grace window replay works · login 10 OK + 11th = 429 ·
  x-request-id custom preserved · admin gate `/notifications/test`:
  customer 403, admin 201 · webhook dedup retries deduped=true ·
  unknown provider 404 · backup script writes 59 kB gzip · admin default
  password warning fires

- **Phase 14 — Desktop Experience** 🟢 done (2026-05-23)
  ทำ desktop variant แยกออกจาก mobile แบบ form-factor split ทั้งทุกหน้าหลัก
  ตามรูปแบบ Option B (separate `<Mobile/>` + `<Desktop/>` components) เพื่อให้
  desktop ได้ UX/UI ของตัวเอง ไม่ใช่แค่ mobile ที่ stretch ·
  **14.0 Foundation**:
  `apps/web/src/lib/use-responsive.ts` — `useIsDesktop()` ใช้
  `useSyncExternalStore` + `matchMedia('(min-width: 1024px)')`; SSR snapshot
  คืน `false` (mobile-first) ทำให้ hydration ปลอดภัย; subscribe live resize ·
  `apps/web/src/components/layout/desktop-page-layout.tsx` — primitives 3 ตัว
  (`DesktopPageLayout` sidebar+main, `DesktopSplitPane` list+detail Gmail-style,
  `DesktopBuyBoxLayout` main+sticky-aside) ·
  **14.1 Admin desktop shell**:
  `admin-nav-config.ts` แยก nav เป็น 4 groups (ภาพรวม/ความเสี่ยง/Moderation/Insights) ·
  `admin-desktop-shell.tsx` sidebar 240px + topbar 56px + breadcrumbs ·
  `admin-mobile-shell.tsx` คงเดิม (pill tabs scroll) · `(admin)/layout.tsx`
  เปลี่ยนเป็น thin router ที่เลือก shell ตาม `useIsDesktop()` ·
  หน้า `/admin`, `/admin/videos`, `/admin/reviews` เปลี่ยนจาก `container-mobile`
  เป็น `mx-auto max-w-screen-xl px-4 lg:px-8` + grid lg:cols-2/3 สำหรับ list ·
  **14.2 `/profile` 2-col desktop**:
  `_shared.tsx` (TabKey, formatStat, shareProfile), `_mobile.tsx` (TikTok-style
  เดิมจาก Phase 12.2.1), `_desktop.tsx` ใหม่ — sidebar 320px (avatar 144px +
  stats stacked + CTAs + vertical link list + logout) + main 5-col video grid ·
  **14.3 PDP 2-col**:
  `_mobile.tsx` (full-bleed hero + sticky bottom CTA, เดิม),
  `_desktop.tsx` — gallery left (square + thumbnails) + sticky buy box right
  400px (price, qty, add to cart, trust badges, referral, creator promo);
  รายละเอียดเป็น prose ใต้แทนซ่อนในการ์ดเล็ก ·
  **14.4 Cart + Checkout**:
  Cart: `_mobile.tsx` (vertical list + bottom CTA), `_desktop.tsx`
  (line items left + sticky summary right 380px) ·
  Checkout: `_state.ts` extract `useCheckoutState()` hook ที่ถือ form state +
  queries + submit logic ทั้งหมด (470 บรรทัด); `_sections.tsx` แต่ละการ์ด
  (Items/Address/Coupon/Carrier/Payment) เป็น component สแตนด์อะโลน;
  `_mobile.tsx` stack vertical + sticky bottom; `_desktop.tsx` 2-col + sticky
  summary right ที่แสดงทั้ง subtotal/shipping/discounts/total + submit button ·
  **14.5 `/orders` Gmail master-detail**:
  `_list-panel.tsx` shared (variant `rich` mobile / `compact` desktop —
  inbox-style row + active highlight) · Mobile `/orders` ใช้ `rich` + buy-again
  strip ด้านบน · Desktop `/orders` แสดง list ซ้าย 380px + empty-state ขวา ·
  `[id]/_detail-panel.tsx` extract ทั้ง detail body (status hero, shipment
  timeline, items+totals, address, NP Protect, actions, ReviewBlock,
  DisputeSheet 688 บรรทัด) เพื่อ reuse · Mobile `/orders/[id]` คง sticky
  header glass + container-mobile · Desktop `/orders/[id]` ใช้ split-pane
  เดียวกัน list ซ้าย + detail ขวา (with sticky header แสดง order id + status) ·
  Pattern ทั้งหมด: data hooks ใช้ React Query key เดียวกัน → dedupe network
  call เมื่อสลับ form factor; ไฟล์ `_mobile.tsx` / `_desktop.tsx` / `_shared.tsx` /
  `_state.ts` ใช้ `_` prefix → Next.js ไม่ treat เป็น route ·
  Smoke: typecheck ผ่าน (`pnpm exec tsc --noEmit`); lint ผ่านทุกไฟล์ใหม่; ไม่มี
  pre-existing regression
  `bootstrap-phase10-3.ts` (`proactive_nudges` dedupe ledger + `product_price_history`
  daily rollup) ·
  `ProactiveService` รวม 2 หน้าที่:
  (1) **personalised feed rails** — `recentlyViewed`, `favShopsNew`, `bargainsFromBrowse`,
  `similarToRecent` (server-driven shelves, อ่าน-อย่างเดียว);
  (2) **outbound nudges** — 5 sweepers ส่งผ่าน `NotificationService` (channel=AUTO,
  topic=PROMOTIONAL): `BROWSE_ABANDON` (3+ view, 7d, ไม่ซื้อ), `CART_ABANDON` (24h+
  cart-no-purchase), `WIN_BACK` (inactive 14d+ ที่มี taste profile), `PRICE_DROP`
  (ราคาตก ≥10% จาก max ของ 14 วันที่ผ่านมา ในของที่ user ดู 30 วัน), `FAV_SHOP_NEW_ARRIVAL`
  (ร้าน top-3 affinity ออกของใหม่ 24h) ·
  **Dedupe**: ทุก fire ลง `proactive_nudges` ledger + cooldown 24-168h ต่อ kind ต่อ entity ·
  **Privacy gate**: `ConsentService.isBehavioralOptedOut` → skip; ใช้ topic=PROMOTIONAL
  ผ่าน notification preferences ของ Phase 9.1 ·
  `ProactiveCronService` setInterval — browse-abandon 6h, cart 4h, win-back 24h,
  fav-shop 6h, price-snapshot 24h, price-drop 6h; stagger initial run ·
  **Chatbot context** (Phase 10.3 extension to 9.3):
  เพิ่ม intent `BROWSE_HELP` + tools `recent_browse` / `product_context`;
  `sendChatMessageInputSchema.context` มี productId/shopId/surface; widget infer จาก URL
  (pdp/cart/checkout/search) → ส่ง context ทุก turn → bot greeting บน PDP เปลี่ยนเป็น
  "เห็นว่ากำลังดูสินค้าอยู่ — ให้ช่วยอะไรไหม?" + suggested action "ถามเกี่ยวกับสินค้านี้" ·
  **Endpoints** `GET /v1/me/feed/rails` (bundle), `/v1/me/feed/bar` (currentlyViewing
  + lastSearch), `/v1/me/nudges` (in-app inbox), admin `POST /v1/admin/proactive/sweep/:kind`
  + `POST /v1/admin/proactive/snapshot` ·
  Web feed page render personalised rails ใต้ "AI เลือกให้" + "มาแรง"; ChatWidget
  อ่าน `pathname` แล้วส่ง context ทุก turn

---

## 6. กฎ build ลงมือถือ (Mobile Build Rules)

โปรเจ็กต์นี้ **ต้อง build ใน "โทรศัพท์"** ได้เสมอ

### ขั้นต่ำ (Phase 1+)
- เป็น **PWA** (มี `manifest.json`, service worker, icons ครบทุกขนาด)
- ลูกค้าเปิด `https://...` แล้วกด **Add to Home Screen** ได้
- ใช้งาน **offline พื้นฐาน** ได้ (เปิดดูคำสั่งซื้อล่าสุด, ตะกร้า)
- รองรับ **Push Notification (Web Push)** สำหรับ Android (iOS 16.4+ ก็รองรับ)
- ทุกหน้า responsive 360px → 1440px+
- รองรับ **safe area** ของ iPhone (notch)

### Capacitor (scaffold พร้อมแล้ว — Phase 1.5)
- **Config**: `apps/web/capacitor.config.ts`
- **Plugins**: `@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`
- **Live reload dev**: `CAP_SERVER_URL=http://<LAN-IP>:3000 pnpm cap:dev:ios|android`
- **Production**: `BUILD_STATIC=true pnpm build` → `pnpm cap:sync` → `pnpm cap:open:ios|android`
- เผยแพร่: App Store / Play Store
- Native API ที่จะใช้: กล้อง (Creator QR), GPS (Local Commerce), Push (Order updates), Biometric (Payment)

ดูรายละเอียดเต็มที่ `docs/mobile-access.md`

### Build commands ที่ Agent ต้องดูแลให้ใช้งานได้
```bash
# Dev
pnpm dev                                      # ทั้ง stack
cd apps/web && WEB_HOST=0.0.0.0 pnpm dev      # web bind LAN (มือถือเข้าได้)
cd apps/api && pnpm dev                       # api bind 0.0.0.0 อยู่แล้ว

# PWA build
cd apps/web && pnpm build                     # SSR/SSG mode
cd apps/web && pnpm preview                   # build + start prod (PWA active)

# Capacitor (after `pnpm cap:add:ios` and/or `cap:add:android` ครั้งแรก)
cd apps/web && BUILD_STATIC=true pnpm build   # → out/
cd apps/web && pnpm cap:sync                  # copy out/ เข้า native projects
cd apps/web && pnpm cap:open:ios              # เปิด Xcode
cd apps/web && pnpm cap:open:android          # เปิด Android Studio
cd apps/web && pnpm cap:dev:ios               # live reload บน device/simulator
cd apps/web && pnpm cap:dev:android           # live reload บน device/emulator
```

---

## 7. มาตรฐานโค้ด (Coding Standards)

- **Language**: TypeScript strict mode ทุก package
- **Naming**: `camelCase` ฟังก์ชัน/ตัวแปร · `PascalCase` Component/Class · `kebab-case` ชื่อไฟล์ · `SCREAMING_SNAKE_CASE` env
- **Lint**: ESLint + Prettier (config กลางที่ `packages/config`)
- **Commit**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)
- **Branch**: `main`, `dev`, `feat/<name>`, `fix/<name>`
- **PR**: ต้องผ่าน lint + typecheck + test ก่อน merge
- **Test**: Vitest (unit) + Playwright (e2e mobile viewport)

---

## 8. Workflow เมื่อ Agent ได้รับงาน

ทุกครั้งที่ user สั่งงาน Agent ต้องตอบกลับด้วยลำดับนี้:

1. **เข้าใจสเปก** — สรุปงานเป็นข้อ ๆ
2. **อ้างอิงเอกสาร** — บอกว่าอ่านไฟล์ไหนใน `docs/`
3. **วางโครงสร้าง** — บอกจะแก้/สร้างไฟล์อะไร, dependency อะไร
4. **ขอยืนยัน** (ถ้ามี trade-off สำคัญ)
5. **ลงมือ** — แก้/สร้างไฟล์
6. **ตรวจ lint/test** — รัน `pnpm lint && pnpm typecheck`
7. **สรุป** — บอกผลกระทบ + อัปเดต `Agent.md`/`roadmap.md` ถ้าจำเป็น

---

## 9. คำสั่งที่ห้ามทำ (Hard Rules)

- ❌ ห้าม commit secret/key ลง git (`.env*` ต้องอยู่ใน `.gitignore`)
- ❌ ห้ามใช้ `any` ใน TypeScript เว้นแต่จะ comment อธิบายเหตุผล
- ❌ ห้ามใช้ inline style บน Component สาธารณะ (ใช้ Tailwind class)
- ❌ ห้ามแก้ schema database โดยไม่ทำ migration
- ❌ ห้ามลบเอกสารใน `docs/` โดยไม่ทำ ADR
- ❌ ห้ามใส่ business logic ใน Next.js page โดยตรง (แยกเป็น service/use-case ใน `apps/api`)

---

## 10. การติดต่อ / Maintainer

- Owner: **NP / @ii**
- ไฟล์นี้อัปเดตเมื่อ: 2026-05-23 (Phase 14 — Desktop Experience: Option B separate Mobile/Desktop variants)
