# Roadmap — NP Commerce OS

> ปรับเปลี่ยนได้ แต่ต้องอัปเดต `Agent.md` และทำ ADR ถ้าโครงสร้างเปลี่ยน
>
> ภาพรวมระดับ product (vision, personas, IA, KPI, feature catalog) ดูได้ใน [`docs/prd.md`](./prd.md)

---

## Phase 0 — Spec & Scaffold ✅

- [x] วางโครงโฟลเดอร์ monorepo
- [x] เขียน `Agent.md`
- [x] เขียน `README.md`
- [x] เขียน `docs/overview.md`, `architecture.md`, `roadmap.md`
- [x] เขียนเอกสารราย module 13 ไฟล์
- [x] เขียน ADR แรก (tech stack)
- [x] วาง config root: `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`, `.nvmrc`, `.env.example`

---

## Phase 1 — Core Commerce MVP (กำลังทำ 🟡)

**เป้าหมาย**: ร้านค้าขายของได้ ลูกค้าซื้อของได้ จบครบ flow basic

ดูคู่มือเริ่มรัน: [`docs/phase-1-quickstart.md`](./phase-1-quickstart.md)

### Deliverables
- [x] สมัครร้านค้า + เปิดร้าน (KYC พื้นฐาน → Phase 2)
- [x] ลงสินค้า (รูป, ราคา, สต็อก) — วิดีโอ/ตัวเลือกใน Phase 1.5
- [x] หน้าสินค้า (responsive mobile-first)
- [x] ตะกร้า + Checkout (1 page, multi-shop split)
- [x] Payment record (PromptPay QR payload) + **mock confirm** (Omise/PromptPay จริงใน Phase 1.5)
- [x] Order management (ฝั่งร้าน + ฝั่งลูกค้า)
- [x] Dashboard ร้านค้า: ยอดขายรวม, รอจัดส่ง, ออเดอร์ล่าสุด
- [x] **PWA**: manifest, service worker, installable, theme color, safe-area
- [x] Auth: Email + Password (JWT) — OTP เบอร์โทรใน Phase 1.5
- [ ] PWA icons จริงจาก logo
- [ ] Dockerfile production (web + api)
- [ ] Real PromptPay/Omise integration (แทน mock)

### Tech checkpoint
- [x] monorepo build ผ่าน (`pnpm install` + `pnpm typecheck`)
- [ ] web ขึ้น Vercel ได้ (รอสร้าง project + env)
- [ ] api ขึ้น Railway/Fly ได้ (รอ Dockerfile)
- [x] database migration ทำงาน
- [x] e2e: signup → list product → buy → confirm payment → see order → ship

---

## Phase 2 — Trust & Logistics 🟢

**เป้าหมาย**: ลูกค้ามั่นใจกล้าซื้อ, ร้านมีตัวเลือกขนส่ง

### Deliverables
- [x] **Escrow ledger** (เงินถูกถือไว้จนลูกค้ายืนยันรับของ)
- [x] **NP Protect**: Buyer Protection, Dispute flow (KYC เข้ม + Risk Score ใน Phase ถัดไป)
- [x] **Logistics Hub**: 6 carriers seed (Flash/Kerry/J&T/ไปรษณีย์/Grab/Lalamove) — รอ webhook จริง
- [x] เลือกขนส่งฝั่งลูกค้า, คำนวณค่าส่งแบบ dynamic
- [x] Tracking + mock advancement
- [x] Refund flow (manual ผ่าน dispute)

---

## Phase 3 — Creator / Affiliate 🟢

**เป้าหมาย**: ให้ Creator ช่วยขาย และ track ค่าคอมได้

### Deliverables
- [x] Creator onboarding (โปรไฟล์, social accounts) — KYC เข้มทำใน Phase 6
- [x] "เลือกสินค้าไปโปรโมท" สร้างลิงก์ระดับ product/ร้าน
- [x] Generate short code + QR code (รุ่นแรกใช้ QR service ภายนอก)
- [x] Tracking referral ผ่าน localStorage + cookie 30 วัน (click tracking)
- [x] Commission engine: rate default 5% + override ต่อลิงก์ (basis points)
- [x] Creator dashboard: ลิงก์, คลิก, conversion, รายได้รอ/รับแล้ว
- [x] Wallet ของ Creator ใช้ระบบเดียวกับ merchant (entry kind `COMMISSION_EARN`)
- [x] หัก commission อัตโนมัติออกจาก escrow merchant เมื่อ release
- [x] Reverse commission อัตโนมัติเมื่อ dispute → REFUND
- [ ] Anti-fraud (self-referral, click farm) — Phase 6 AI

---

## Phase 4 — Local Commerce 🟢

**เป้าหมาย**: ร้านอาหาร / ร้านท้องถิ่นใช้ระบบขายได้

### Deliverables
- [x] Merchant type = local store (`LocalStore` 1-to-1 กับ `Shop`)
- [x] พิกัดร้าน + รัศมีจัดส่ง + เวลาทำการรายวัน
- [x] เมนูอาหาร — `MenuCategory` + `MenuItemMap` (variant / add-on → Phase 4.5)
- [x] นัดรับ / นัดส่ง (slot booking) — `TimeSlot` พร้อม capacity
- [x] Rider partner — `Rider` profile + apply / location update / accept-pickup-deliver flow
- [x] Auto-dispatch DeliveryJob เมื่อ payment confirm + carrier เป็น `EXPRESS_LOCAL`
- [x] Customer "ใกล้ฉัน" — geo search ผ่าน Haversine (ฝั่ง app)
- [x] Customer หน้าร้าน — เมนู, ช่วงเวลา, ดูข้อมูลร้าน, เปิดแผนที่
- [x] Merchant: ตั้งค่าร้าน + จัดหมวดเมนู + จัดช่วงเวลา
- [x] Rider Dashboard: toggle ออนไลน์, ดูงานเปิด, accept → pickup → deliver
- [x] Carrier `NPRIDER` (kind `EXPRESS_LOCAL`) — seed อัตโนมัติ
- [ ] Real-time map tracking (websocket) — Phase 4.5
- [ ] เชื่อม Grab Express / Lalamove เป็น fallback dispatch — Phase 4.5

---

## Phase 5 — Marketing Engine 🟢

**เป้าหมาย**: ใช้ TikTok ดึงคน → สร้าง traffic ของเราเอง

### Deliverables
- [x] Short Video Feed (TikTok-like) — `VideoPost` + `/feed/videos` snap scroll
- [x] Coupon engine — `PERCENT` / `FIXED` / `FREE_SHIPPING`
      ของแพลตฟอร์ม + ของร้าน · quote/redeem at checkout
- [x] Loyalty — `LoyaltyAccount` + tier (BRONZE/SILVER/GOLD/PLATINUM)
      earn อัตโนมัติเมื่อ PAID (10฿ = 1 แต้ม × multiplier) · redeem เป็นส่วนลด
- [x] Referral — โค้ดคนชวน + auto-reward เมื่อ signup ผ่าน `?ref=`
- [x] Broadcast — In-app message ตาม audience (ALL/BUYERS/ABANDONED_CART/WIN_BACK/VIP)
- [x] Retarget audiences (ABANDONED_CART, WIN_BACK) — query-based segmentation
- [x] Boost Product / Flash Deal — `Campaign` + `CampaignProduct`
- [x] Customer surfaces: `/rewards`, `/feed/videos`, `/inbox`
- [x] Merchant surfaces: `/merchant/marketing` (coupons, campaigns, broadcasts, videos)
- [ ] Real push delivery (FCM/APNs) — ต้องเชื่อม service จริงใน prod
- [ ] LINE OA + Email channel — Phase 5.5
- [ ] Creator Campaign (link to Phase 3 affiliate links) — Phase 5.5

---

## Phase 6 — AI Engine 🟢

**เป้าหมาย**: ระบบฉลาดขึ้น + ลดงาน Admin (deterministic baseline — ยังไม่พึ่ง LLM)

### Deliverables
- [x] **Customer recommendations** — `/v1/recommendations/{for-you,similar,buy-again,track-view}`
      collaborative (co-purchase) + content (same shop / price band) + popularity
- [x] **For You** strip ใน `/feed` (auth required, AI-personalised)
- [x] **Similar products** strip ใน `/product/[id]` (public)
- [x] **Buy Again** strip ใน `/orders` (auth required)
- [x] **Merchant Insights** — `/merchant/insights`
      KPI 30d (GMV/Orders/Customers/AOV + WoW delta) · 14-day trend chart ·
      Top products · Anomalies (GMV/Order drop, refund surge, low-stock-on-hot, zero-sales) ·
      Price suggestions (vs platform median) · Creator matches
- [x] **Admin Risk Center** — `/admin` (gate ด้วย role=ADMIN)
      Shop risk (rule-based score 0-100 + factor breakdown) ·
      Suspicious orders (high value / new account / velocity) ·
      Logistics issues (late rate, lead time per carrier)
- [x] **Event log**: `product_views` + `model_runs` tables (เก็บไว้ training อนาคต)
- [x] Seed admin user: `admin@np.dev` / `password123`

---

## Phase 6.1 — Smarter AI 🟢

**เป้าหมาย**: ยกระดับ AI ให้ "ฉลาดจริง" ก่อนจะใช้ LLM — ทำงานบนข้อมูลที่มี อย่าง deterministic + audit-able

### Deliverables
- [x] **TF-IDF content similarity** (`/v1/recommendations/similar`)
      เลิกใช้กฎ same-shop+price-band ง่ายๆ → cosine similarity ของชื่อ + description (Thai-aware tokenizer, stopword filter)
      Blended score: 60% text + 25% popularity + 15% same-shop boost; fallback ไป price-band ถ้า text-sim อ่อน
- [x] **Trending detection** (`GET /v1/recommendations/trending`, public)
      Surge ratio = 7d units / (30d avg weekly) → top products
      Section "🔥 มาแรง" บน `/feed` + badge 🔥 บนการ์ดเมื่อ `reason === 'TRENDING'`
- [x] **RFM customer segmentation** (`GET /v1/insights/shops/:id/segments`)
      6 segments: Champions / Loyal / New / At Risk / Lost / Regular
      Threshold เทียบกับ median GMV ของร้าน (ปรับอัตโนมัติตามขนาดร้าน)
      Render bar + ราย-segment พร้อม sample emails + GMV share ใน `/merchant/insights`
- [x] **`model_runs` instrumentation** — บันทึก duration ของทุก AI call (`reco.for-you`, `reco.similar`, `reco.trending`, `reco.buy-again`, `insights.segments`, ...) เพื่อ visibility อนาคต

### Backlog ต่อไป
- [ ] LLM rerank บน TF-IDF top-K (เสริมด้วย embeddings เมื่อมี API key)
- [ ] Fake review classifier — รอ reviews module
- [ ] Chatbot CS — Phase 7

---

## Phase 6.2 — AI in Action 🟢

**เป้าหมาย**: ทำให้ผลของ AI กลายเป็น "action" จริง ๆ ไม่ใช่แค่กราฟ — ปิด loop ระหว่าง insight → operate

### Deliverables
- [x] **Demand forecast** (`GET /v1/insights/shops/:id/forecast`, horizon 1-14 วัน)
      Algorithm: 28-day history → mean (μ) + stddev (σ) → DoW seasonal multipliers s[0..6]
      Forecast(d) = μ × s[dow] ± 1.5σ × s[dow] (confidence band)
      Render บน trend chart ของ merchant: bars ปกติ + confidence band โปร่งใส + เส้น center line + summary "🔮 คาด 7 วัน: ฿X · ~Y ออเดอร์"
- [x] **Segment-aware broadcasts** — ขยาย audience enum:
      `SEG_CHAMPIONS` · `SEG_LOYAL` · `SEG_NEW` · `SEG_AT_RISK` · `SEG_LOST`
      resolveSegment ใช้ RFM logic เดียวกับ insights (median GMV ของร้านเป็น threshold)
      `GET /v1/broadcasts/audience/preview?audience=...&shopId=...` ให้ UI โชว์ count แบบ live
      UI: dropdown แบ่ง optgroup "ทั่วไป" + "AI Segments (RFM)" + "→ จะส่งถึง ~N คน"
- [x] **AI Ops admin dashboard** (`/admin/ai-ops`, admin-only)
      อ่าน `model_runs` 7d → ราย-kind: runs24h/7d, avg ms, p95 ms, fail rate, last run time
      table 50 รายการล่าสุด พร้อม OK/FAIL indicator + auto-refresh ทุก 15s
- [x] **Bug fix**: broadcast `BUYERS` + `WIN_BACK` audiences เคยใช้ `orders.userId` แต่ schema จริงคือ `customerId` → audience คืน 0 คนตลอด ตอนนี้แก้แล้ว
- [x] **Bug fix**: `WIN_BACK` audience รองรับ `shopId` (กรองเฉพาะลูกค้าร้านตัวเอง) แทนที่จะดูทั้ง platform

---

## Phase 7 — Reviews & Reputation 🟢

**เป้าหมาย**: ปิด loop "Customer Review / CRM" — สร้างความมั่นใจให้ลูกค้า + ป้อนสัญญาณกลับให้ AI/Risk

### Deliverables
- [x] **Schema**: `reviews` table (1 review per orderId+productId+customerId tuple, soft-moderated via `isHidden`+`flagReason`, indexed by product/shop/customer)
- [x] **Eligibility**: รีวิวได้เฉพาะเจ้าของออเดอร์ที่สถานะ `DELIVERED` ขึ้นไป — กันรีวิวก่อนได้ของ
- [x] **Public reads**: `GET /v1/reviews/product/:id` + `/summary` (avg + histogram 1-5⭐)
      `GET /v1/reviews/shop/:id/summary`
- [x] **Customer**: `POST /v1/reviews` (write), `GET /v1/reviews/mine`, `GET /v1/reviews/pending` (items waiting for review)
- [x] **Fake-review heuristics** (deterministic, ทำงานตอน insert):
      `SHORT_BODY` (<8 ตัว) · `NEW_ACCOUNT` (<24ชม.) · `DUPLICATE_TEXT` (text ซ้ำกับรีวิวเดิม)
      Moderation view เพิ่ม: `LOW_EFFORT_FIVE_STAR`, `LOW_EFFORT_ONE_STAR`
      `suspicionScore = min(1, flags × 0.25)`
- [x] **Admin moderation**: `GET /v1/reviews/moderation` + `PATCH /:id/hide` (gate AdminGuard)
      UI `/admin/reviews`: filter "ทั้งหมด / ⚠️ น่าสงสัย", flag chips, suspicion %, ปุ่ม ซ่อน/เปิดโชว์
- [x] **Cross-system integration**:
      - Merchant Insights `overview` คืน `avgRating`+`reviewCount` → KPI tile "★ คะแนนเฉลี่ย"
      - Admin Risk Shop เพิ่ม factor `poor_rating` (weight 20, trigger ถ้า ≥3 reviews + avg ≤ 3.0)
- [x] **Customer UI**:
      - Product detail: `RatingPill` ใต้ราคา + `ReviewsSection` (avg + histogram bars + recent reviews)
      - Order detail (DELIVERED+): per-item `WriteReviewForm` (StarPicker 1-5 + textarea) → "✓ รีวิวแล้ว" ทันทีหลัง submit

### Backlog ต่อไป
- [ ] Photo reviews (ต้อง S3 / upload service)
- [ ] Helpful votes (review_helpfuls table)
- [ ] Review reminder broadcasts (auto-send 3 วันหลัง DELIVERED, ใช้ Phase 5 broadcast infra)
- [ ] ML-based fake review classifier (เสริม heuristic ปัจจุบัน — รอ embeddings)

---

## Phase 8 — Search & Discovery 🟢

**เป้าหมาย**: ปิด UX gap ของ "ปุ่มแว่นขยายที่กดไม่ได้" + เปิดทางให้ลูกค้าหาสินค้าเอง (ไม่ใช่แค่ recommend) → catalog discoverability

### Deliverables
- [x] **Schema**: `search_queries` table (id, query, userId, resultCount, createdAt) — log ทุก search สำหรับ trending + zero-result audit
- [x] **Backend SearchModule** (`/v1/search/*`):
      - `POST /products` — TF-IDF จาก Phase 6.1 (cosine vs query + corpus) + substring fallback + popularity (30d units) 20% + rating 10%
      - filters: minPriceCents, maxPriceCents, minRating, shopId · sorts: RELEVANCE / PRICE_ASC|DESC / RATING / NEWEST / POPULAR
      - `GET /shops?q=…` — name match + popularity + rating
      - `GET /suggestions?q=…` — autocomplete (popular product names + recent trending queries, dedupe)
      - `POST /track` — explicit client tracking (เผื่อ search-as-you-type)
      - ทุก call ผ่าน `measured()` → ติด AI Ops dashboard อัตโนมัติ
- [x] **Frontend `/search`**:
      - sticky header + autofocus + autocomplete dropdown · `<mark>` highlight ของ matched terms
      - chip filters (sort × rating × max price) · grid 2-col results · shop strip
      - empty state → recent searches (localStorage, MRU, 8 รายการ) + suggested chips
      - zero-result state → ข้อความ "ไม่พบ …" + fallback ขายดี
- [x] **Wire-ups**: ปุ่มแว่นขยายใน `/feed` + `/local` → `/search` (เดิมกดไม่ได้)
- [x] **Admin `/admin/search`**: trending queries 7d + zero-result queries 30d → ป้อน catalog/synonyms ต่อ
- [x] **Analytics endpoints**: `GET /v1/search/analytics/trending` + `/zero-result` (AdminGuard)

### Backlog ต่อไป
- [ ] ย้ายจาก in-memory TF-IDF → MeiliSearch / pg_trgm + pgvector เมื่อ catalog > 10k SKU
- [ ] Synonyms / typo tolerance (เช่น "iphone15" ↔ "iPhone 15") — ตอนนี้พึ่ง substring fallback
- [ ] Search-as-you-type (debounce 200ms + suspense) ที่ปุ่มแว่นในหัว `/feed`
- [ ] Saved searches + alert when new product matches

---

## Phase 9.1 — Real Notifications & Delivery Channels 🟢

**เป้าหมาย**: ปิด gap "Broadcast เลือก channel ได้ แต่ส่งจริงเฉพาะ INAPP" — เปิด push / email / LINE จริง พร้อม opt-out per channel และ review reminder อัตโนมัติ

### Deliverables
- [x] **Schema** (`bootstrap-phase9.ts`): `push_subscriptions`, `user_devices`, `line_links`, `notification_prefs`, `notification_logs`
- [x] **IntegrationModule** — adapter pattern (`apps/api/src/modules/integration/`)
      - `InAppAdapter` (เขียน `inapp_messages` เหมือนเดิม)
      - `WebPushAdapter` (VAPID, dynamic-import `web-push`, ลบ subscription dead `410/404` อัตโนมัติ)
      - `FcmAdapter` (firebase-admin SDK + legacy HTTP fallback; รองรับทั้ง Android FCM และ iOS APNs ผ่าน FCM)
      - `ApnsAdapter` (direct APNs ผ่าน `apn` lib — สำหรับโปรเจกต์ที่ไม่ใช้ Firebase)
      - `EmailAdapter` (Resend REST + SMTP/Nodemailer fallback)
      - `LineAdapter` (LINE Messaging API push)
- [x] **NotificationService** facade — opt-out (default ON, TRANSACTIONAL bypass), per-channel logging, concurrency-limited fan-out
- [x] **NotificationModule** `/v1/notifications/*`
      - `GET /config` (public; web ใช้ดึง VAPID key)
      - `POST /push/subscribe`, `DELETE /push/subscribe`, `GET /push`
      - `POST /devices`, `DELETE /devices/:token`, `GET /devices`
      - `GET /prefs`, `PATCH /prefs`
      - `GET /line/me`, `POST /line/link`, `DELETE /line/link`
      - `POST /test` (self-test ใน `/profile/notifications`)
- [x] **BroadcastService.send()** wire ใหม่: `mapChannel('PUSH'|'EMAIL'|'LINE')` → fan-out ผ่าน NotificationService พร้อม `sentCount`/`failedCount` ที่ถูกต้อง (channel breakdown อยู่ใน `notification_logs`)
- [x] **Frontend Web Push flow**
      - `apps/web/public/sw-push.js` — dedicated SW (push + click → focus existing tab หรือ open new)
      - `apps/web/src/lib/push.ts` — `subscribeBrowserPush()` / `unsubscribeBrowserPush()` พร้อม VAPID base64url decode
- [x] **`/profile/notifications`** — toggle per channel + เปิด/ปิด Web Push + ส่งทดสอบ + แสดงสถานะ devices + LINE link
- [x] **Merchant `/merchant/marketing/broadcasts`** — ปลดล็อค dropdown channel + warning chip เมื่อ provider ยังไม่ตั้งค่า
- [x] **Review reminder cron** — `ReviewReminderService` (interval 1h, idempotent via `notification_logs.providerMessageId='rr:<orderId>'`) ส่งเตือนเมื่อออเดอร์ DELIVERED 72-168 ชม. ที่ผ่านมายังรีวิวไม่ครบ
- [x] **`.env.example`** เพิ่ม VAPID / FCM / APNs / SMTP / LINE_ACCESS_TOKEN / REVIEW_REMINDER

### หมายเหตุการ deploy
- Dependencies ของ provider (`web-push`, `firebase-admin`, `nodemailer`, `apn`) ใช้ **dynamic require** — typecheck/boot ทำงานได้ก่อนติดตั้ง, แต่ก่อน prod ต้องเพิ่มใน `apps/api/package.json`:
      ```bash
      pnpm --filter api add web-push firebase-admin nodemailer apn
      pnpm --filter api add -D @types/web-push @types/nodemailer
      ```
- ไม่มี dep ใหม่ใน `apps/web` — Web Push ใช้ browser native + Capacitor native plugins (ลงทะเบียนผ่าน `api.notifications.devices.register` เมื่อสร้าง Capacitor push plugin)

### Backlog ต่อไป (Phase 9.3)
- [ ] CS Chatbot — `conversations` + `messages` + LLM tool calls + Socket.IO
- [ ] Scheduled broadcast (Queue worker อ่าน `scheduledAt`)
- [ ] Transactional notifications บน payment/dispute/shipment status (ตอนนี้มีแต่ broadcast + review reminder)
- [ ] LIFF login + auto-link LINE (UI)
- [ ] Capacitor push plugin wiring (FCM/APNs token bootstrap จาก native shell)

---

## Phase 9.2 — Photo Reviews + Storage Layer 🟢

**เป้าหมาย**: ปิด backlog Phase 7 — รีวิวมีรูป + helpful votes + S3-compatible presigned uploads ใช้ได้กับ S3 / R2 / MinIO โดยไม่ต้องลง SDK ใด ๆ

### Deliverables
- [x] **Schema** (`bootstrap-phase9-2.ts`):
      `storage_uploads` (audit ของทุก presign + status PENDING→CONFIRMED) ·
      `review_photos` (รูปต่อรีวิว สูงสุด 5 + `sha256` + `isHidden` ต่อรูป + `sortOrder`) ·
      `review_helpfuls` (1 user/รีวิว unique) ·
      additive `reviews.helpfulCount` (denormalised)
- [x] **StorageModule** (`apps/api/src/modules/storage/`):
      - `sigv4.ts` — zero-dep AWS SigV4 query-string presigner (PUT, expires 10min)
      - `StorageService` — driver auto-detect (S3/R2/MinIO/mock), `presign()` / `confirm()` / `getConfirmedUploads()`
      - Allowed types: JPEG/PNG/WebP/GIF; max 8MB per object
      - `mock` driver กรณีไม่มี keys → คืน synthetic URL ใช้ใน dev ได้เลย
- [x] **`/v1/storage/*`** — `GET /config`, `POST /presign`, `POST /confirm`
- [x] **ReviewService ขยาย**:
      - `create()` รับ `photoUploadIds[]` → ดึง confirmed uploads + insert row ใน `review_photos`
      - `PHOTO_DUPLICATE` heuristic (sha256 ซ้ำกับรีวิวเก่า) → auto-flag
      - `listForProduct()` → optional viewer (JWT decode ผ่าน header) → คืน `photos` + `helpfulByMe` + sort by `helpfulCount`
      - `toggleHelpful()` (กันโหวตรีวิวตัวเอง, denormalize นับใหม่จาก source-of-truth)
      - `hidePhoto()` (admin per-photo moderation) → flag `PHOTO_HIDDEN` ขึ้นใน moderation view
- [x] **Web upload helper** (`apps/web/src/lib/upload.ts`):
      - Compress client-side (canvas, scale ≤1600px edge, WebP/JPEG @0.82)
      - SHA-256 hash ฝั่ง client (Web Crypto API) → ส่งกลับใน confirm
      - Presign → PUT → confirm pipeline; mock driver skip PUT
- [x] **WriteReviewForm** — photo picker สูงสุด 5 รูป + preview thumbnail + ลบรูปได้ + disable ขณะอัปโหลด
- [x] **ReviewsSection ใหม่**:
      - Photo gallery grid 64×64 thumbnails
      - Lightbox modal (swipe ‹/› indicator + close + image counter, click outside ปิด)
      - "👍 มีประโยชน์" pill button + count
      - Toggle ปกป้องด้วย token; โหวตเองไม่ได้ (server-side)
- [x] **API client (`apps/web/src/lib/api.ts`)** — เพิ่ม `api.storage.*` + `api.reviews.toggleHelpful` + `hidePhoto`
- [x] **`.env.example`** — เพิ่ม `S3_PATH_STYLE` + `S3_PUBLIC_BASE` พร้อม comment driver auto-detection

### หมายเหตุ
- Zero new deps: SigV4 ใช้แค่ built-in `crypto` ของ Node — ใช้ได้กับ S3/R2/MinIO/Wasabi ทันที
- Mock driver ทำให้ dev ทำงานได้โดยไม่ต้อง spin up MinIO หรือ S3 — เหมาะกับ CI

### Backlog ต่อไป (Phase 9.4+)
- [ ] Video reviews (ต้องเพิ่ม processing pipeline + thumbnail extract)
- [ ] Photo moderation queue UI (`/admin/reviews` ต้อง render `<img>` + ปุ่ม hide ต่อรูป — controller มีแล้ว แค่ wire UI)
- [ ] Image perceptual hashing (pHash) แทน sha256 strict-match — กันรูปดัดแปลงเล็กน้อย
- [ ] Auto orphan cleanup (storage_uploads ที่ PENDING > 24h → DELETE จากบัคเก็ต)

---

## Phase 9.3 — CS Chatbot (Conversational Support) 🟢

**เป้าหมาย**: เปิด channel customer support ใน-app — บอทตอบคำถามทั่วไป + ดึงข้อมูลจริงจากระบบ (orders/disputes/reviews) + escalate ไปแอดมินได้เมื่อจำเป็น

### Deliverables
- [x] **Schema** (`bootstrap-phase9-3.ts`):
      `chat_conversations` (`status` OPEN/CLOSED, `handoffStatus` BOT/REQUESTED/HUMAN/RESOLVED, `unreadByAdmin`) ·
      `chat_messages` (role USER/ASSISTANT/TOOL/SYSTEM, `intent`, `toolName`/`toolArgs`/`toolResult` JSON, `suggestedActionsJson`)
- [x] **Bot tools** (`apps/api/src/modules/chat/bot/tools.ts`):
      `lookup_order` / `list_my_orders` / `recent_disputes` / `pending_reviews` /
      `policy_info` (shipping/return/payment/account) / `request_human_handoff` —
      ทุกตัวรันด้วย authorization ของ user (ผ่าน OrderService/DisputeService/ReviewService) เลยไม่มี cross-tenant leak
- [x] **Intent classifier** (`intent.ts`) — keyword/regex รองรับไทย+อังกฤษ ทำงานทันทีไม่ต้องเรียก LLM
- [x] **LLM rephraser** (`llm.ts`) — OpenAI หรือ Anthropic ผ่าน REST (`fetch` ตรง, ไม่มี SDK dep) ใช้แค่เรียบเรียงข้อความ
      จาก FACTS ที่ tool คืน — **ห้ามให้ LLM แต่งข้อมูลเอง** ป้องกัน hallucination ของ orderId / tracking / ราคา
- [x] **ChatService**:
      - `send()` → คลาสซิฟาย intent → เลือก tool → ตี LLM rephrase ถ้ามี → persist message + suggested actions
      - Hand-off lifecycle: `HUMAN_HANDOFF` intent หรือ `request_human_handoff` tool → `handoffStatus=REQUESTED` →
        แจ้ง admin ผ่าน `NotificationService.notifyUser` (best-effort)
      - Admin: `adminReply()` → `HUMAN` (หรือ `RESOLVED` ถ้า `closeAfter=true`) + push noti กลับลูกค้า
      - `adminTakeOver()` flip status → `HUMAN`
- [x] **REST surface** (`/v1/chat/*`):
      - Customer: `GET /config`, `GET /conversations`, `GET /conversations/active`,
        `GET /conversations/:id/messages`, `POST /messages`
      - Admin: `GET /admin/conversations?handoff=REQUESTED|HUMAN|ALL`,
        `GET /admin/conversations/:id/messages` (ลด unreadByAdmin),
        `POST /admin/reply`, `PATCH /admin/conversations/:id/take-over`
- [x] **Web SDK** — `api.chat.*` + `api.chat.admin.*`
- [x] **ChatWidget** (`apps/web/src/components/chat-widget.tsx`):
      Floating bubble ใน customer layout · panel slide-up · optimistic UX ·
      suggested-action chips ใต้ทุก bubble · typing dots · poll active conversation ทุก 8s
- [x] **`/admin/chat`** — list filter (REQUESTED/HUMAN/ALL) + conversation pane พร้อมตอบกลับ + checkbox "ปิดเคสหลังตอบ" + ปุ่ม "รับเรื่อง"
- [x] **AI Ops integration** — ทุก turn log เป็น `model_runs` kind=`chatbot.turn` พร้อม `intent=...` `provider=...`

### หมายเหตุ
- ทำงานได้โดยไม่มี API key ของ LLM — fallback ใช้ deterministic summary ของ tools
- ไม่เพิ่ม dependency ใดเลย (OpenAI / Anthropic เรียก REST ตรงผ่าน `fetch`)
- Tool architecture เผื่อขยายให้รองรับ `proposeToolCall()` ของ LLM ใน 9.4

### Backlog ต่อไป (Phase 9.4+)
- [ ] **Streaming**: เปลี่ยน `POST /chat/messages` เป็น SSE/WebSocket เพื่อสตรีมตอบกลับ
- [ ] **Tool-calling จาก LLM**: ใช้ `tools` field ของ OpenAI/Anthropic ให้โมเดลเลือก tool เองในกรณี UNKNOWN
- [ ] **Multi-shop routing**: คำถามเกี่ยวกับร้านเฉพาะ → ส่ง handoff ไปแอดมินของร้านนั้น (ตอนนี้ส่ง global admins)
- [ ] **Embeddings + RAG**: index FAQ / นโยบายร้าน → ใช้ใน `policy_info` แทน static answers
- [ ] **Sentiment-driven escalation**: ตรวจอารมณ์โมโห → auto-flip handoff โดยไม่ต้องรอ keyword

---

## Phase 10.1 — Behavioural Event Firehose 🟢

**เป้าหมาย**: วาง foundation สำหรับ "ระบบเรียนรู้พฤติกรรม user แบบ Facebook/Google" —
หลังเฟสนี้ทุก interaction (view/click/dwell/scroll/cart/search/purchase) กลายเป็น
event row เดียวกัน พร้อมให้ ranker (10.2) ใช้คำนวณ taste profile

### Deliverables
- [x] **Schema** (`bootstrap-phase10.ts`):
      `user_events` (append-only firehose · indices on userId/anonId/entity/kind/session) ·
      `user_sessions` (per browser tab, anonId stable across visits) ·
      `user_consents` (per-user opt-out + retentionDays override)
- [x] **EventKind enum** (closed set, 25 kinds): page_view / product_view / product_dwell /
      product_scroll / search_query / search_click / add_to_cart / remove_from_cart /
      checkout_start / purchase / wishlist_* / follow_shop / share / video_* /
      noti_open / email_open / chat_open / reco_impression / reco_click + session_*
- [x] **EventsService** (`apps/api/src/modules/events/`):
      - `startSession()` / `linkAnonToUser()` (login stitches anon → user)
      - `ingestBatch()` รับ array สูงสุด 100 event ต่อ request, dedupe ในวินาทีเดียวกัน,
        opt-out gate (cached 30s), bulk multi-VALUES insert ใน transaction เดียว
      - `recentForUser()` / `stats()` (per-kind, per-surface count ใน 24 ชม.)
      - `purgeOlderThan()` ถูกเรียกโดย retention cron
- [x] **ConsentService** — `/v1/me/privacy` GET/PATCH + `/v1/me/events` GET/DELETE
      (`deleteMyHistory()` ลบ user_events + sessions ของฉันทั้งหมด GDPR-style)
- [x] **OptionalJwtAuthGuard** — guard ใหม่ที่ accept anonymous traffic
      (ใช้กับ `/v1/events/batch` + `/v1/events/session` เพื่อ track ลูกค้าที่ยังไม่ login)
- [x] **EventsRetentionService** — cron `setInterval(6h)` purge events เก่ากว่า
      `EVENT_RETENTION_DAYS` (default 180), บังคับ floor 30 วัน
- [x] **Web SDK** (`apps/web/src/lib/track.ts`):
      - Singleton tracker: queue สูงสุด 50 event หรือ flush ทุก 5 วินาที
      - `navigator.sendBeacon` ตอน `pagehide`/`visibilitychange→hidden` (กัน event หายเวลา navigate)
      - localStorage anonId (durable) + sessionStorage sessionId (idle 30 min reset)
      - Consent gate ฝั่ง client (`np_consent` localStorage) — Privacy page บังคับ sync ทันที
      - `tracker.identify(userId, token)` ตอน login → call `/events/link-anon`
- [x] **React hooks** (`apps/web/src/lib/track-hooks.ts`):
      `useTrackOnce`, `useDwellTracker` (pause เมื่อ tab hidden, fire ครั้งเดียวเมื่อครบ threshold),
      `useScrollDepth` (75% default, one-shot)
- [x] **Wire ลงหน้าจริง**:
      - PDP: `product_view` + `product_dwell(30s)` + `product_scroll(75%)`
      - Feed/Home: `page_view`
      - Cart: `page_view`; PDP add-to-cart: `add_to_cart`
      - Checkout: `checkout_start` + per-order `purchase` (พร้อม totalCents + itemCount)
      - Search: `search_query` ทุกครั้งที่ commit คำค้น
      - RecommendationStrip: `reco_impression` (one-per-item-per-render) + `reco_click`
      - Login/Signup: tracker.identify เพื่อ link anon → user
- [x] **Privacy page** (`/profile/privacy`):
      - Toggle "ติดตามและเรียนรู้พฤติกรรม" (default ON ตามนโยบาย — opt-out)
      - Retention selector (30 / 90 / 180 / 365 / 730 days)
      - แสดง 50 event ล่าสุดของฉัน (transparency)
      - ปุ่ม "ลบประวัติพฤติกรรมของฉัน" (2-step confirm)
- [x] **Admin firehose dashboard** (`/admin/events`):
      KPI 24h (events / unique users / sessions) + bar chart byKind + bySurface
      (poll ทุก 30s)
- [x] **`.env.example`** — `EVENT_RETENTION_DAYS`, `EVENT_RETENTION_DISABLED`

### หมายเหตุ
- Zero new deps (sendBeacon + fetch + sessionStorage + crypto.randomUUID)
- Anonymous tracking ทำงานทันทีตั้งแต่ visit แรก — ไม่ต้อง login
- Opt-out gate cache 30s กัน DB hit บน hot path; consent toggle จาก client เห็นผลทันที (server บังคับใน batch ถัดไป)
- Legacy `product_views` + `search_events` ยังเก็บข้อมูลเหมือนเดิม — 10.2 จะค่อยย้าย ranker ไปอ่านจาก `user_events`

### Backlog ต่อไป (Phase 10.2+)
- [x] **UserTasteProfile + online updater** — ✅ ทำใน Phase 10.2 (ดูด้านล่าง)
- [x] **Multi-signal ranker** — ✅ ทำใน Phase 10.2
- [x] **LLM rerank** — ✅ ทำใน Phase 10.2 (`LLM_RERANK_ENABLED=true`)
- [ ] **Proactive surfaces (10.3)** — smart push (3-view-no-buy reminder), chatbot
      context-aware nudge, homepage personalised rails ("เพิ่งดู" / "ลดราคาในของที่ดู")
- [ ] **Evaluation framework (10.4)** — CTR per surface, A/B bucketing ผ่าน env, conversion lift dashboard

---

## Phase 10.2 — User Taste Profile + Multi-signal Ranker 🟢

### ที่ทำในเฟสนี้
1. **Schema (`user_profiles`)** — denormalised snapshot ต่อ user (sparse vectors:
   `shopAffinity`, `tagAffinity`, `priceMedian/Std`, `recentItemIds[]`, `boughtItemIds[]`,
   `eventCount`, `generation`, `lastUpdatedAt`) ผ่าน `bootstrap-phase10-2.ts`
2. **TasteService** — สร้างโปรไฟล์จาก `user_events` ภายใน window 30 วัน
   - ถ่วงน้ำหนักด้วย exponential decay (`exp(-ageDays / 14)`)
   - `EVENT_WEIGHTS` ต่อ event kind (purchase=25, add_to_cart=5, dwell=2.5, view=1.0, …)
   - รวม signal จากออเดอร์ที่ซื้อจริงด้วย (เป็น signal ที่แข็งที่สุด)
   - L1-normalise เพื่อให้เปรียบเทียบข้าม user ได้
3. **TasteWorker** — ดึงคิว userIds ที่ถูก dirty ทุก 30s แล้วค่อย rebuild
   เป็น batch (concurrency=4) — ไม่บล็อก hot path ของ `/events/batch`
4. **Firehose → Taste wiring** — `EventsService.registerIngestListener(cb)` ให้
   downstream subscribe โดยไม่ต้องสร้าง circular import; `linkAnonToUser` ก็
   trigger rebuild ทันทีหลัง login เพื่อ stitch ประวัติ anon → user
5. **`forYou2()` ranker — multi-signal** (อยู่ใน `RecommendationService`):
   - **contentSim 30%**: cosine ระหว่าง user vector (recency-weighted avg ของ
     TF-IDF ของของที่ดูล่าสุด) กับ candidate TF-IDF
   - **shopAffinity 25%**: น้ำหนักร้านจากโปรไฟล์
   - **tagAffinity 20%**: รวม weight ของ token ในชื่อ/รายละเอียดสินค้า
   - **priceMatch 10%**: gaussian รอบ priceMedian±priceStd
   - **popularity 10%**: units 30d / maxUnits
   - **exploration 5%**: random jitter เล็กน้อย กัน filter-bubble
   - **MMR-style diversity** — cap ≤ 3 ชิ้น/ร้าน ใน top-N
   - **Reason mapping** — เลือก reason ตาม dominant component
     (`BECAUSE_VIEWED` / `FAVOURITE_SHOP` / `SAME_CATEGORY` / `PRICE_MATCH` /
     `POPULAR` / `EXPLORE`)
6. **Optional LLM rerank** — `apps/api/src/modules/recommendation/llm-rerank.ts`
   ส่ง top-30 + user-summary ให้ OpenAI/Anthropic ขอเรียงใหม่ผ่าน JSON
   - hallucination guard: ทุก id ที่ตอบกลับมาต้องอยู่ใน input set; backfill ตัวที่ขาด
   - 4s timeout, fall back ไป deterministic ranker ทันที — feed ห้ามช้า
   - เปิดด้วย `LLM_RERANK_ENABLED=true`
7. **Endpoints**:
   - `GET /v1/me/taste` — สรุปโปรไฟล์ตัวเอง (โชว์ที่ /profile/privacy)
   - `POST /v1/me/taste/rebuild` — force rebuild
   - `DELETE /v1/me/taste` — รีเซ็ตโปรไฟล์
   - `GET /v1/admin/users/:id/taste` — admin debug
   - `GET /v1/recommendations/for-you/explain` — top-N + per-candidate breakdown
   - `GET /v1/recommendations/for-you` ตอนนี้เรียก `forYou2` (cold-start ตก
     ไปใช้ legacy popularity-blended `forYou` แบบ silent)
8. **Frontend**:
   - `/profile/privacy` เพิ่ม card "สิ่งที่ระบบเรียนรู้ว่าคุณชอบ" — แสดง topShops,
     topTags, priceMedian, eventCount, lastUpdated; ปุ่ม "อัปเดต / รีเซ็ตโปรไฟล์"
   - `recommendation-strip` เพิ่ม `<ReasonBadge>` สีต่างกันตาม reason
     (👀 เพราะคุณดู / ⭐ ร้านโปรด / 🔥 มาแรง / ✨ ลองดู)

### ทำไมต้องเขียนแบบนี้
- **ทุก signal จับต้องได้** — โปรไฟล์ทั้งหมดเป็น JSON 1 แถวต่อ user เปิดดูได้
  จาก `/profile/privacy` ทำให้เคารพ "right to explain" (PDPA/GDPR-aligned)
- **ไม่ต้องมี vector DB** — TF-IDF + cosine ใน-process พอใน scale หลายแสนสินค้า
  เปลี่ยนเป็น pgvector/Qdrant ภายหลังโดยไม่ต้องแก้ ranking logic
- **Cold start ไม่พัง** — ผู้ใช้ใหม่ตกไปใช้ popularity ของเดิม; พอเริ่มมี
  3+ events ถึงจะเปลี่ยนเป็นโหมด personalised
- **LLM = rerank เท่านั้น** — ไม่ใช่ source-of-truth; ทุก id ต้องผ่าน whitelist
  ของ candidate set ของจริง → ห้ามแต่ง product ขึ้นเอง
- **Decoupled writes** — taste worker ไม่อยู่ใน hot path; ingest บูม 50 events
  → 1 rebuild ต่อ user เท่านั้น

### Env vars ใหม่
- `TASTE_WINDOW_DAYS=30`
- `TASTE_HALF_LIFE_DAYS=14`
- `TASTE_TICK_MS=30000`
- `TASTE_COLD_START_MIN=3`
- `TASTE_WORKER_DISABLED=false`
- `LLM_RERANK_ENABLED=false`
- `OPENAI_RERANK_MODEL=gpt-4o-mini` (optional)
- `ANTHROPIC_RERANK_MODEL=claude-3-5-haiku-latest` (optional)

### Backlog ต่อไป (Phase 10.3+)
- [x] **Proactive surfaces (10.3)** — ✅ ทำใน Phase 10.3 (ดูด้านล่าง)
- [ ] **Evaluation framework (10.4)** — CTR per surface, A/B bucketing ผ่าน env,
      conversion lift dashboard, holdout group
- [ ] **Online updater** — เปลี่ยน batch-rebuild → incremental update ต่อ event
- [ ] **Item embeddings ที่จริงจัง** — fastText/SBERT แทน TF-IDF เมื่อ catalog > 10k
- [ ] **Negative signals** — ดูแล้วเลื่อนผ่านไว ๆ / กลับมาไม่ได้คลิกเลย = ลดน้ำหนัก
- [ ] **Cross-session continuity** — รวม anon profile กับ user profile ทันที

---

## Phase 10.3 — Proactive Surfaces 🟢

### ที่ทำในเฟสนี้
1. **Schema** `bootstrap-phase10-3.ts`
   - `proactive_nudges` (dedupe ledger: userId × kind × entityId × sentAt)
   - `product_price_history` (1 row per product per day; ใช้คำนวณ price drop)
2. **ProactiveService** ทำสองหน้าที่:
   - **Feed rails** (read-only personalised shelves):
     - `RECENTLY_VIEWED` — ของที่ user เปิดดูล่าสุด (`product_view` event)
     - `FAV_SHOPS_NEW` — สินค้าใหม่จาก top-5 shop affinity (สร้างใน 30 วัน)
     - `BARGAINS_FROM_BROWSE` — ของที่ user ดู + ราคา ≤ user priceMedian
     - `SIMILAR_TO_RECENT` — `recs.similar()` ของชิ้นล่าสุด
   - **Outbound nudges** (5 sweepers ผ่าน `NotificationService` topic=PROMOTIONAL):
     - `BROWSE_ABANDON` — view ≥ 3 ครั้งใน 7 วัน, ไม่ add_to_cart/purchase
     - `CART_ABANDON` — add_to_cart > 24h, ไม่ purchase ตามมา
     - `WIN_BACK` — มี taste profile แต่ inactive 14+ วัน
     - `PRICE_DROP` — ราคาวันนี้ < 90% × max(14 วันก่อนหน้า), user เคยดูใน 30 วัน
     - `FAV_SHOP_NEW_ARRIVAL` — top-3 affinity shop ออกของใหม่ใน 24h
3. **Dedupe + Privacy**:
   - ทุก nudge fire → INSERT `proactive_nudges`; cooldown ต่อ kind:
     BROWSE/CART_ABANDON 48h, WIN_BACK 168h, PRICE_DROP 72h, FAV_SHOP 168h,
     BACK_IN_STOCK 24h
   - `ConsentService.isBehavioralOptedOut(userId)` short-circuit ทั้ง pipeline
   - ใช้ `NotificationService` ของ Phase 9.1 → honour per-channel/per-topic opt-out
     อัตโนมัติ
4. **ProactiveCronService**:
   - setInterval ต่อ sweep + stagger initial 5–25 นาที กัน boot spike
   - Disable per-kind ผ่าน `PROACTIVE_<KIND>_DISABLED=true` หรือทั้งหมด
     `PROACTIVE_SWEEPS_DISABLED=true`
5. **Chatbot context-awareness** (extension to Phase 9.3):
   - เพิ่ม intent `BROWSE_HELP` ใน classifier (keywords: แนะนำสินค้า, ของที่ดู, เปรียบเทียบ, recommend, compare, ...)
   - เพิ่ม tools `recent_browse` (สรุปของที่เพิ่งดู) + `product_context`
     (ดึงรายละเอียดสินค้าจาก `ctx.context.productId`)
   - `sendChatMessageInputSchema.context = { productId, shopId, surface }`
   - Widget infer context จาก `pathname` (`/product/:id` → productId, `/cart`, etc.)
   - Bot GREETING บน PDP เปลี่ยนเป็น "เห็นว่ากำลังดูสินค้าอยู่ — ให้ช่วยอะไรไหม?"
     พร้อม suggested action "ถามเกี่ยวกับสินค้านี้"
6. **Endpoints**:
   - `GET /v1/me/feed/rails` — bundle of personalised shelves
   - `GET /v1/me/feed/bar` — currentlyViewing/lastSearch/lastShop + pendingNudgeCount
   - `GET /v1/me/nudges` — in-app inbox (สำหรับ render badge บน Bell icon ภายหลัง)
   - `POST /v1/admin/proactive/sweep/:kind` — manual trigger (browse-abandon /
     cart-abandon / win-back / fav-shop-new / price-drop)
   - `POST /v1/admin/proactive/snapshot` — manual price snapshot
7. **Frontend**:
   - `/feed` page render personalised rails ใต้ "AI เลือกให้" + "มาแรง"
   - `ChatWidget` อ่าน `pathname` แล้วส่ง `context` ทุก message — ทำให้ bot รู้ว่า
     user อยู่หน้าไหน

### ทำไมต้องเขียนแบบนี้
- **Idempotent + non-spammy** — `proactive_nudges` ledger + cooldown ทำให้
  re-run sweep ปลอดภัย; เปลี่ยน schedule ใหม่ก็ไม่ดบเบิ้ลส่ง
- **Privacy เป็นชั้นแรก** — opt-out จาก `/profile/privacy` (10.1) ทำให้ทั้ง
  learning + nudging หยุด instant; topic=PROMOTIONAL ให้ user เลือก channel
  ที่ต้องการรับได้ (9.1)
- **ใช้ infra เดิมหมด** — ไม่มี dependencies ใหม่; NotificationService (9.1) +
  TasteService (10.2) + EventsService (10.1) ครบทุกชิ้น
- **ChatBot ไม่หลุดคาแรกเตอร์** — context ไม่เปลี่ยน FACTS source; tools ยัง
  ดึงจาก DB จริง, LLM ยังแค่ rephrase
- **Server-driven feed rails** — เพิ่ม/ลดสไตล์ rail ได้โดยไม่ต้อง deploy web
  (server เปลี่ยน title/caption/order ของ rail ได้ทันที)

### Env vars ใหม่
- `PROACTIVE_SWEEPS_DISABLED=false`
- `PROACTIVE_BROWSE_ABANDON_DISABLED` / `CART_ABANDON` / `WIN_BACK` /
  `FAV_SHOP_NEW_ARRIVAL` / `PRICE_DROP` / `PRICE_SNAPSHOT` (per-kind kill switches)

### Backlog ต่อไป (Phase 10.4+)
- [ ] **Evaluation framework (10.4)** — CTR/conversion lift per surface,
      A/B bucketing ผ่าน env, holdout group ที่ไม่ถูก nudge เพื่อวัด causal lift
- [ ] **In-app nudge inbox UI** — แสดง bell badge + drawer ของ `/me/nudges`
- [ ] **Back-in-stock** nudge — track sold-out → restock event บน products
- [ ] **Throttle ระดับ user** — รวม nudge ทุกชนิด อย่างมาก N ครั้ง/สัปดาห์
- [ ] **Smart timing** — สังเกตว่า user เปิด push ตอนกี่โมง แล้ว schedule ตามนั้น
- [ ] **Negative feedback loop** — user dismiss nudge → ลดน้ำหนัก signal ที่
      เกี่ยวข้องในการ rebuild ครั้งถัดไป

---

## Phase 11 — UX/UI Redesign 🟡 (in progress)

**เป้าหมาย**: ปรับ UX/UI ทั้งระบบให้ desktop ≠ mobile อย่างชัดเจน · รองรับ dark mode · scale ไป native app ได้

### Phase 11.1 — Foundation + Customer Shell 🟢 done (2026-05-22)
- [x] **Design tokens 2 ชุด** (light/dark) ผ่าน CSS custom properties:
      `--surface-page` / `--surface-raised` / `--text-strong` / `--border-default` ฯลฯ
      Tailwind `darkMode: 'class'` + `.dark` selector
- [x] **No-flash theme bootstrap** — inline `<script>` ก่อน hydrate set `dark` class จาก localStorage หรือ
      `prefers-color-scheme`
- [x] **`ThemeProvider`** (light/dark/system) + **`ThemeToggle`** (icon + pill variants)
- [x] **`CustomerShell`** แยกเสามือถือ vs เดสก์ทอป:
      - Mobile (<lg, ≤1023px): glass sticky header (logo+search+bell+theme) + bottom-tab 5 ปุ่ม
        (Home/ใกล้ฉัน/Cart/Orders/ฉัน)
      - Desktop (≥lg): top bar 64px (logo + horizontal nav + wide search + bell + cart + profile + theme)
        + centered content max-w-app 1280px
- [x] **Landing `/`** redesign แบบ 2-layout:
      - Mobile: refine hero CTA stack เดิม + marquee + bento mobile + merchant CTA
      - Desktop: 12-col hero + floating product cards stack + 4-col feature grid + 2-col CTA (merchant + creator)
- [x] **Feed `/feed`** refactor:
      - Mobile: chip row + bento 6-col + 2-col products
      - Desktop: sub-hero strip + bento 12-col + 5-col product grid + larger spacing
- [x] **Container utility `.container-app`** responsive 480→768→1280px (replaces `container-mobile` for desktop-aware pages)
- [x] **Semantic surface utilities** (`bg-surface*`, `text-surface-*`, `border-surface*`) — ทำงานทั้ง light/dark
- [x] **Glass + chip adaptive** — รองรับ dark mode โดย swap CSS vars
- [x] **Tailwind config** เพิ่ม: `xs/2xl` breakpoints · heights (`topbar-d/m`, `bottomnav-m`) · `zIndex` semantic · `max-w-app`

### Phase 11.2 — ที่เหลือ (queue)
- [ ] Apply shell pattern ให้ทุกหน้า customer (cart/checkout/PDP/search/orders/rewards/etc.) ที่ยังมี inline header เก่า
- [ ] Merchant shell (desktop: left sidebar 240px · mobile: bottom-tab)
- [ ] Admin shell (desktop-first: table primitive + filter bar + dense layout)
- [ ] Creator + Rider shells
- [ ] ย้าย design system + AppShell + primitives ไป `packages/ui`
- [ ] Component preview (Storybook-equivalent)
- [ ] Accessibility audit (WCAG 2.1 AA) บน customer flow
- [ ] Dark mode QA ทุกหน้า (เน้น contrast + image overlay)

---

## Phase 12 — TikTok-style Video Feed 🟢 done (2026-05-23)

**`/feed` ถูกโปรโมตเป็น vertical short-video reel** (TikTok-style) เป็น "หน้าหลัก" ของ
customer persona — old commerce home ย้ายไป `/feed/shop`.

- [x] **VideoFeed primitive** — `apps/web/src/components/video/video-feed.tsx`
  - vertical CSS scroll-snap (`snap-y mandatory`, `100dvh` ต่อ clip)
  - `IntersectionObserver` per `<video>` (≥60% visible → play, else pause) · one-at-a-time
  - global mute toggle · tap-to-play/pause · loop · `playsInline`
  - infinite scroll ผ่าน `useInfiniteQuery` (โหลด page ถัดไปเมื่อ active index ≥ `N-3`)
  - deep-link `?v=<id>` → `scrollIntoView`
  - right action rail: avatar+`+`follow, like (optimistic+rollback), comment (v2), bookmark
    (local), share (`navigator.share`→clipboard), spinning music disc
  - bottom caption: `@author` + shop chip + hashtags (parsed) + music ticker + product CTA pill
  - desktop: phone frame `max-w-[440px] aspect-[9/16]` + side panel 320px
- [x] **Immersive shell adaptation** — `CustomerShell` ตรวจ `IMMERSIVE_ROUTES = Set(['/feed'])`
  - hide `CustomerMobileHeader` · hide `ChatWidget` · drop `pb-24`
  - `CustomerBottomNav variant="overlay"` → translucent dark glass
  - `z-immersive: 30` < `z-bottomnav: 40` → nav floats above video
- [x] **Nav refresh**
  - mobile bottom-nav (5 tabs): ฟีด · ช้อป · ตะกร้า · ใกล้ฉัน · ฉัน
  - desktop top-bar: ฟีด · ช้อป · ใกล้ฉัน · คำสั่งซื้อ (removed "คลิป")
- [x] **Old commerce home → `/feed/shop`** — bento + AI For You + Trending + Personalised rails
  + product grid; identical UX, just relocated
- [x] **Back-compat redirect** — `/feed/videos[?v=]` → 307 → `/feed[?v=]`
- [x] **Behavioural tracking**
  - `video_play` (one-shot per clip, first play)
  - `video_complete` (`<video onEnded>`)
  - `share` with `meta.kind=like|share`
  - `reco_click` on product CTA tap (`meta.from='video'`)
  - server `POST /v1/feed/:id/view` (score bump)
- [x] **Seed** — `bootstrap-phase12.ts` insert 8 ภาษาไทย demo clips ลง `video_posts`
  เมื่อ table ว่าง (idempotent); attach ตาม user/shop/product แรกใน DB; ใช้ Google
  sample mp4s + `picsum.photos` posters
- [x] **Icons เพิ่ม** — `PauseIcon`, `VolumeOnIcon`, `VolumeOffIcon`, `MusicIcon`,
  `BookmarkIcon`, `CommentIcon`

---

## Phase 12.1 — User Video Upload 🟢 done (2026-05-23)

> Goal: ให้ลูกค้าใด ๆ ก็โพสต์คลิปเข้า `/feed` ได้จากกล้องมือถือใน 3 แท็ป
> (เลือกไฟล์ → ใส่แคปชั่น → โพสต์) โดยใช้ Storage layer ของ Phase 9.2 เป็นแกน

- [x] **Types** — `packages/types/src/storage.ts` + `apps/api/src/shared/types/storage.ts`
  - `storageUploadPurposeSchema` เพิ่ม `'video'` (ตัว `video_thumb` มีอยู่แล้ว)
  - `STORAGE_LIMITS` per-purpose bytes:
    `review_photo / product_media / cs_attachment = 8 MB`,
    `shop_logo = 4 MB`, `video = 100 MB`, `video_thumb = 2 MB`
  - `presignUploadInputSchema.sizeBytes.max` ขยายเป็น 110 MB (ceiling) —
    per-purpose enforcement ทำที่ service
  - `storageConfigSchema` เพิ่ม `limits` + `allowedByPurpose` (FE ใช้ pre-validate ก่อน upload)
- [x] **StorageService** — `apps/api/src/modules/storage/storage.service.ts`
  - `ALLOWED_BY_PURPOSE: Record<purpose, MIME[]>` (image purposes → JPEG/PNG/WebP/GIF,
    video → `mp4|webm|quicktime`, video_thumb → image set)
  - Reject ด้วย `BadRequestException` พร้อม message ที่อ้าง purpose
  - `extFromType()` → `.mp4` / `.webm` / `.mov`
  - `getConfig()` คืน `limits` + `allowedByPurpose` (mock driver ก็ยัง validate ปกติ)
- [x] **Client helpers** — `apps/web/src/lib/upload-video.ts` (separate from `upload.ts` ที่ compress รูป)
  - `probeVideo(file)` → `{ durationSec, width, height, aspect }` ผ่าน
    `<video preload=metadata>` + blob URL
  - `extractVideoPoster(file, { atSec=0.5, width=720, height=1280, quality=0.82 })`
    → canvas snapshot 9:16 object-cover JPEG
  - `uploadVideoFile(token, file, { onProgress })` — XHR `upload.onprogress` (fetch
    streaming body ยังไม่ใช้ได้ทุก browser) · skip compression · auto-confirm บน mock
  - `uploadVideoPoster(token, blob)` — purpose=`video_thumb`
- [x] **Composer** — `apps/web/src/app/(customer)/feed/create/page.tsx`
  - Auth gate: `useEffect` redirect `/login?next=%2Ffeed%2Fcreate` เมื่อ `token === null`
  - Picker: `<input type=file accept="video/mp4,video/webm,video/quicktime" capture="environment">`
    (มือถือ tap = เปิดกล้อง back-cam ตรง)
  - Client validate (ลำดับ): size → MIME → `probeVideo` → duration ≤ 90s
  - Preview `<video controls>` ด้วย aspect ที่ probe ได้, มี trash button + "เปลี่ยนคลิป"
  - Caption textarea (≤ 500), tag chip input (Enter / `,` / space → push, Backspace → pop),
    optional shop selector (auto-pick shop แรกของ user สำหรับ merchant), optional product CTA
  - Submit pipeline: poster → uploadVideo (with progress bar) → uploadThumb → `api.feed.create`
    → `qc.invalidateQueries(['feed','videos'])` → `router.push('/feed?v=<id>')`
- [x] **FAB** — `apps/web/src/components/shell/create-fab.tsx`
  - Mobile: floating "+" centred + `bottom: env(safe-area-inset-bottom) + 5.5rem`
    เหนือ overlay bottom-nav
  - Desktop: pill "สร้างคลิป" ขวาล่าง
  - `href` ปรับตาม `token`: ถ้า logged-out → ตรงไป `/login?next=…`
  - Render เฉพาะ immersive route — `CustomerShell` swap `<ChatWidget>` ↔ `<CreateFAB>`
- [x] **Env** — `.env.example`
  - เพิ่ม R2 production example (endpoint / bucket / access keys / `S3_PUBLIC_BASE` = custom CDN)
  - เพิ่ม CORS checklist (`AllowedMethods: ["GET","PUT","HEAD"]` + custom domain)
  - เพิ่ม per-purpose limits table (8 MB อิมเมจ · 100 MB video · 2 MB video_thumb · 4 MB shop_logo)
- [x] **Seed harden** — `bootstrap-phase12.ts`
  - Deterministic ID `seed_v12_NN` + `INSERT OR IGNORE` → idempotent ทุก restart
  - One-shot cleanup ของ duplicate seed (legacy `vid_*` IDs จาก seed v1)

**Smoke (live)**
- `GET /v1/storage/config` → `limits` + `allowedByPurpose` ครบ 6 purposes
- `POST /v1/storage/presign {purpose:video, image/jpeg}` → 400 `"ไม่อนุญาตสำหรับ purpose 'video'"`
- `POST /v1/storage/presign {purpose:video, 101 MB}` → 400 `"ใหญ่กว่า 100MB"`
- `POST /v1/storage/presign {purpose:video, video/mp4, 5 MB}` → mock URL OK
- `POST /v1/feed { videoUrl:<mockUrl>, caption:"คลิปทดสอบ", tags:["test"] }` →
  row `vid_*` ปรากฏที่ `/v1/feed` พร้อม caption ไทย
- Web routes: `/feed/create` → 200 (composer load สำเร็จ)

### Phase 12.x — future (queue)
- [ ] Comments API + UI (รวม mention/heart-reply/replies tree)
- [ ] Follow/unfollow API + creator profile reel
- [ ] **Personalised video ranking** — extend `TasteService` ให้รวม tag affinity จาก
  `video_posts.tagsJson` + dwell-on-video; `FeedService.feed` เรียง personalised order
- [ ] **Server-side transcoding** — HLS adaptive bitrate (`ffmpeg` worker / Cloudflare
  Stream / Mux) เพื่อรองรับ Wi-Fi/4G อัตโนมัติ
- [ ] **Server-verified ownership** — `feed.create` รับ optional `videoUploadId` +
  `thumbUploadId` → ตรวจ `storage_uploads.status='CONFIRMED'` + ownership แทนการเชื่อ URL
- [ ] **Multi-stream prefetch** — preload clip `i+1` ขณะดู `i` (เพื่อ instant snap)
- [ ] **Save list UI** — bookmark ที่เก็บใน DB (`video_bookmarks` table) + `/me/saved`
- [ ] **Hashtag reels** — `/feed/tag/[slug]` ใช้ `VideoFeed` กับ custom `fetcher`
- [ ] **PDP reel** — `<VideoFeed>` แสดงแค่ video ที่ tag กับ product นั้น
- [ ] **Composer v2** — trim/crop/filter, music library, beat-snap, captions auto-generate,
  multi-clip stitch
- [ ] **Auto-moderation** — copyright fingerprint (Cloudflare Stream / Mux), hashtag
  block-list, image classifier บน thumbnail
- [ ] **Janitor cron** — sweep orphaned bucket objects (storage_uploads CONFIRMED but
  no video_posts row), retention policy for DELETED rows > 30d

---

## Phase 12.2 — User Video Management + Admin Moderation 🟢 done (2026-05-23)

> Goal: ปิด gap จาก Phase 12 — เจ้าของจัดการคลิปตัวเองได้ + ผู้ใช้คนอื่นรายงานได้ +
> ทีมซัพพอทมีหน้าหลังบ้านสำหรับ moderate · ครบ flow end-to-end จากการ post → report →
> review → action → bucket cleanup

### 12.2a Schema
- [x] **`video_reports` table** (`bootstrap-phase12-2.ts`) —
  `id, videoId, reporterId, reason, note, status, resolvedBy, resolvedAt,
  resolution, createdAt` พร้อม 3 index (videoId+ts, status+ts, reporterId+ts)
- [x] **UNIQUE partial index** `(videoId, reporterId) WHERE status='PENDING'` —
  กัน user คนเดียว flood queue ด้วยรายงานซ้ำ + auto 409 ที่ controller
- [x] **VideoStatus enum** ขยายเป็น `ACTIVE | REPORTED | HIDDEN | DELETED`
  (Zod-level change — SQLite TEXT รับได้อยู่แล้ว ไม่ต้อง ALTER)
- [x] **One-shot housekeeping**: reset `status NULL/empty` → `'ACTIVE'`

### 12.2b Storage delete
- [x] **`sigv4.deleteObject()`** — สำหรับ S3/R2/MinIO ผ่าน SigV4 query-string DELETE,
  idempotent (รับ 204/200/404)
- [x] **`StorageService.deleteByObjectKey()` + `deleteByUrl()`** — แตก URL กลับเป็น
  objectKey, ลบไฟล์, mark `storage_uploads.status='DELETED'` · safe no-op โหมด mock ·
  `objectKeyFromUrl()` รองรับ both R2 publicBase และ local mock prefix

### 12.2c User-facing API
- [x] **`GET /v1/feed/mine`** (JWT) — เจ้าของเห็นทุก status ยกเว้น DELETED
  (ต้องเห็น HIDDEN/REPORTED ของตัวเองเพื่อรู้ว่าโดน moderate)
- [x] **`POST /v1/feed/:id/report`** (JWT, throttle 10/h) — รับ
  `{reason, note?}` · กันรายงานคลิปตัวเอง 400 · `OTHER` ต้องใส่ note (Zod refine) ·
  ครั้งแรกที่ถูกรายงาน auto-flip `ACTIVE → REPORTED`
- [x] **`DELETE /v1/feed/:id`** ขยายให้ cleanup bucket video+thumb +
  auto-resolve reports เป็น `'DELETE'`
- [x] **`POST /v1/feed`** ตอนนี้ throttle `20/hour/user` — กัน upload bot

### 12.2d Admin API (ทีมซัพพอท)
- [x] **`GET /v1/feed/admin/all`** (JWT+Admin) — list + filter
  `?status=REPORTED|ACTIVE|HIDDEN|ALL` + `?onlyReported=true` · join
  `pendingReports`, `lastReportReason`, `lastReportAt`
- [x] **`GET /v1/feed/admin/reports`** (JWT+Admin) — flat report queue
  + join `videoCaption/Status/ThumbUrl + authorName + reporterName`
- [x] **`PATCH /v1/feed/admin/:id/moderate`** (JWT+Admin) —
  `{action: HIDE|RESTORE|DELETE, note?}` · เปลี่ยน `video_posts.status` +
  RESOLVED reports พร้อม resolution · DELETE จะ cleanup bucket
- [x] **`AllExceptionsFilter` + Sentry** — coverage เดิม (5xx capture)
  ครอบทุก endpoint ใหม่อัตโนมัติ

### 12.2e Web
- [x] **API client** (`apps/web/src/lib/api.ts`): `feed.mine`, `feed.report`,
  `feed.admin.{list, reports, moderate}` · pattern เดียวกับ `chat.admin`
- [x] **`/profile` hub** (new) — landing สำหรับ bottom-nav "ฉัน" tab; ลิงก์ไป
  videos / orders / notifications / privacy · ถ้า `role=ADMIN` แสดงปุ่ม
  "→ เปิดหลังบ้าน"
- [x] **`/profile/videos`** (new) — grid 9:16 thumbnails, status badge
  ("เผยแพร่"/"อยู่ระหว่างตรวจสอบ"/"ซ่อนจากทีมงาน"), view stats, ปุ่ม "ดู" + "ลบ"
  (confirm dialog แจ้งว่าจะลบไฟล์ใน server ด้วย)
- [x] **`/admin/videos`** (new, ในเมนู admin layout) — 2 แท็บ
  "คลิป" + "รายงานล่าสุด" · pill filter status · ปุ่ม inline HIDE/RESTORE/
  DELETE · refetchInterval 30s · เพิ่ม `/admin/chat` กลับเข้านาวด้วย (เคยลืม)
- [x] **`components/video/report-sheet.tsx`** — bottom-sheet modal
  7 reason เลือกแบบ radio, textarea required เมื่อ `OTHER`, success state +
  auto-close 1.4s, anon → "เข้าสู่ระบบเพื่อรายงาน" CTA, ESC ปิด, backdrop ปิด
- [x] **"เพิ่มเติม" button** ใน video-feed right rail (icon dots) — ซ่อนเมื่อ
  เป็นเจ้าของคลิป (`user.id === v.authorId`); เปิด report sheet สำหรับ video นั้น
- [x] **bottom-nav** "ฉัน" tab redirect `/profile/privacy → /profile`

### 12.2f Smoke (live, end-to-end)
- author signup → post `/v1/feed` → `/feed/mine` status=ACTIVE
- self-report → 400 "รายงานคลิปของตัวเองไม่ได้"
- reporter report → `{ok:true, pendingReports:1}`
- duplicate report (same reporter+video) → 409 "คุณรายงานคลิปนี้ไปแล้ว"
- status auto-flip ACTIVE → REPORTED
- public `/v1/feed` ไม่แสดงคลิปที่ REPORTED
- admin queue: `pendingReports=1`, `lastReportReason='SPAM'`
- admin reports: join `reporterName='Reporter'`, `note='โฆษณาเยอะ'`
- admin moderate `HIDE` → `{ok:true, status:'HIDDEN'}` + report resolution='HIDE'
- non-admin moderate → 403
- author DELETE → soft-delete + bucket cleanup + reports auto-resolve
- `OTHER` reason without note → 400 "กรุณาใส่รายละเอียดเมื่อเลือก 'อื่น ๆ'"

---

## Phase 13 — Production Hardening 🟢 done (2026-05-23)

> Goal: ปิด ops gap ทั้งหมดก่อนเปิดให้ user ใช้จริง — Sentry, backup,
> migration discipline, throttle, refresh tokens, default admin password,
> payment webhook integrity, runbook

### 13.1 Observability
- [x] **Sentry on API** — `apps/api/src/common/observability/sentry.ts` import
  first ก่อน `NestFactory` เพื่อ patch http/fetch · 5xx + unhandled exception →
  `Sentry.captureException` พร้อม URL + reqId tag · redact `authorization`/`cookie`
- [x] **Sentry on Web** — `instrumentation.ts` (server) + `sentry.client.config.ts`
  (browser); ทุกตัว no-op เมื่อ `SENTRY_DSN` ว่าง · ต้อง `experimental.instrumentationHook=true`
  ใน Next 14
- [x] **Request ID** — Fastify `genReqId` (incoming `x-request-id` หรือ UUID) +
  `onSend` hook echo header · ทุก response มี `x-request-id` ให้ user paste ใน support ticket
- [x] **`/v1/metrics`** — Prometheus exposition (text/plain) + `/v1/metrics/json` ·
  series: uptime, RSS/heap, 8 audit-table row counts, 24h notification/model/event/nudge counters

### 13.2 Migration + Backup
- [x] **`STRICT_MIGRATIONS`** env (default `true` ใน prod) → `process.exit(1)`
  เมื่อ bootstrap-phase ใดล้ม · กัน silent failure ที่ทำให้ API up พร้อม table หาย
- [x] **`scripts/db-backup.sh`** — auto-detect driver จาก `DATABASE_URL` ·
  sqlite (`sqlite3 .backup` + gzip) หรือ Postgres (`pg_dump -Fc`) · optional
  R2/S3 upload ผ่าน `aws` CLI · retention `BACKUP_LOCAL_RETAIN` (default 30) ·
  exit codes 0 ok / 1 config error / 2 tool failed / 3 upload failed (local preserved)

### 13.3 Auth hardening
- [x] **In-process throttler** — `apps/api/src/common/throttle/throttler.ts`
  sliding-window counter + `@Throttle({windowSec,max,keyBy})` decorator,
  global `ThrottleGuard` (no-op without decorator); applied: signup 5/min/IP,
  login 10/min/(IP+email), refresh 30/min/IP, /notifications/test 6/min,
  /payments/webhook 120/min
- [x] **Refresh tokens** — `refresh_tokens` table (Phase 13 migration) +
  `POST /v1/auth/refresh` single-use rotation พร้อม 60s grace window;
  reuse outside grace → revoke ALL sessions for that user (theft defence) ·
  `JWT_ACCESS_TTL` ลดเหลือ `1h` (เดิม 7d) · `REFRESH_TTL_DAYS=30`
- [x] **`ADMIN_EMAIL` / `ADMIN_PASSWORD` env** — `bootstrap-phase6.ts`
  ปฏิเสธ boot ใน `NODE_ENV=production` ถ้าใช้ default `password123` ·
  non-prod warn เสียงดังที่ stdout
- [x] **`/v1/notifications/test`** → admin-only + throttle 6/min
  (เดิมเปิดให้ทุก authenticated user trigger ส่ง push/email/LINE ตัวเองได้)

### 13.4 Payment adapter pattern
- [x] **`PaymentAdapter` interface** — `apps/api/src/modules/payment/adapters/types.ts`
  contract `{ id, isReady(), createCharge(input), verifyWebhook(rawBody, headers) }`
- [x] **`MockPaymentAdapter`** — preserve legacy Phase-1 mock QR + dev webhook
  ที่ไม่ verify signature
- [x] **`OmisePaymentAdapter`** — native `fetch` ไม่ผูก SDK · POST `/sources`
  (PromptPay) → POST `/charges` · webhook HMAC-SHA256 verify ผ่าน
  `OMISE_WEBHOOK_SECRET` ด้วย `timingSafeEqual` · `metadata[order_id]` map กลับ
  payment row
- [x] **`PAYMENT_PROVIDER`** env (`auto|omise|mock`) เลือก adapter ตอน boot;
  `auto` fallback mock เมื่อ Omise key ไม่ครบ; log `[PaymentService] payment adapter = ...`
- [x] **`payment_webhook_events` dedup ledger** — UNIQUE on `(provider, providerEventId)`;
  retry ครั้งที่ 2 ตอบ `{ ok:true, deduped:true, settled:<bool> }` skip side-effects
- [x] **`ALTER TABLE payments`** เพิ่ม `provider`/`providerRef`/`failureMessage`
  columns (PRAGMA-guarded re-run safe)
- [x] **`POST /v1/payments/webhook/:provider`** controller — raw-body
  re-stringify (works for both JSON-based providers ที่มีตอนนี้)
- [x] **`GET /v1/payments/config`** public endpoint — FE checkout อ่านได้ว่า
  provider อะไร พร้อมหรือยัง รองรับ method ไหน
- [x] **`PaymentService.settle(orderId)` funnel** — เดียวสำหรับทั้ง
  `confirmMock` และ webhook path: wallet escrow + local rider dispatch + loyalty earn

### 13.5 Runbook
- [x] **`docs/operations.md`** (~ 450 บรรทัด) — daily/weekly/monthly checklist,
  Prometheus alert queries, cron table + kill switches, SQL playbook (top 6
  queries), payment onboarding (Omise), 5 incident playbooks (API down,
  notifications stopped, charge mismatch, suspicious admin, disk full),
  kill switch inventory, code-location index

**Smoke (live)**
- `/v1/health` 200 · `/v1/metrics` Prometheus + JSON
- signup → `{ accessToken, refreshToken, expiresInSec: 3600 }`
- refresh rotates · grace-window replay ok
- login 10/min throttle: 10× 401, 11th = 429
- `x-request-id: my-trace-abc` preserved end-to-end
- `/v1/notifications/test`: customer 403, admin 201
- webhook retry deduped=true · unknown provider 404
- backup script: 59 kB gzip in `./backups/np-sqlite-*.db.gz`
- bootstrap-phase6 warns: `⚠️  admin account admin@np.dev kept with DEFAULT dev password`

---

## Phase 14 — Desktop Experience 🟢 done (2026-05-23)

**เป้าหมาย**: ทุกหน้าหลักต้องมี desktop UX/UI เป็นของตัวเอง ไม่ใช่แค่ mobile
ที่ stretch ไปกลางจอ; ทีมซัพพอทใช้ admin console บน desktop ได้สบาย

### Strategy
- **Option B — separate `<Mobile/>` + `<Desktop/>` per page** ทุกหน้าหลัก
- ไฟล์ `_mobile.tsx` / `_desktop.tsx` / `_shared.tsx` / `_state.ts` ใช้
  prefix `_` → Next.js ไม่ treat เป็น route
- ทั้งสอง variant share React Query keys → dedupe network call เมื่อสลับ
  form factor (ไม่ re-fetch)
- `useIsDesktop()` (`useSyncExternalStore` + `matchMedia('(min-width:1024px)')`)
  เป็น single source of truth สำหรับการเลือก variant; SSR snapshot =
  mobile (ปลอดภัย hydration)

### Deliverables

- [x] **14.0 Foundation** — `useIsDesktop()` hook + 3 layout primitives
  (`DesktopPageLayout`, `DesktopSplitPane`, `DesktopBuyBoxLayout`)
- [x] **14.1 Admin desktop shell** — sidebar 240px (4 nav groups) +
  topbar 56px + breadcrumbs + admin profile/logout panel ที่ก้นไซด์บาร์
  - [x] `admin-nav-config.ts` SSoT สำหรับทั้ง mobile + desktop nav
  - [x] `(admin)/layout.tsx` thin router
  - [x] `/admin`, `/admin/videos`, `/admin/reviews` ขยายเต็มความกว้าง
    (max-w-screen-xl) + grid lg:cols-2/3 สำหรับ list
- [x] **14.2 `/profile` 2-col desktop** — sidebar 320px (avatar 144px +
  stats stacked + CTAs + vertical link list + logout) + main 5-col video grid
  - Mobile คง TikTok-style จาก Phase 12.2.1
- [x] **14.3 PDP 2-col** — gallery left (square + thumbnails) + sticky
  buy box right 400px; full prose description ใต้
- [x] **14.4 Cart + Checkout desktop**
  - Cart: 2-col line items + sticky summary 380px
  - Checkout: `useCheckoutState()` hook ถือ form state ทั้งหมด →
    `_sections.tsx` (Items/Address/Coupon/Carrier/Payment) →
    2-col layout + sticky summary 400px
- [x] **14.5 `/orders` Gmail master-detail** — `OrdersListPanel` shared
  (compact desktop / rich mobile) + `OrderDetailPanel` shared (extracted
  จาก [id]/page.tsx 688 บรรทัด) → split-pane list ซ้าย 380px +
  detail ขวา; mobile คง flow เดิม
- [x] **14.6 Polish** — Agent.md + roadmap.md อัปเดต;
  reusable primitives อยู่ใน `apps/web/src/components/layout/`

### Files changed (สำคัญ)
- ใหม่: `apps/web/src/lib/use-responsive.ts`
- ใหม่: `apps/web/src/components/layout/desktop-page-layout.tsx`
- ใหม่: `apps/web/src/components/shell/admin-{desktop,mobile}-shell.tsx`
- ใหม่: `apps/web/src/components/shell/admin-nav-config.ts`
- ใหม่ (12 ไฟล์ split): `(customer)/{profile,product/[id],cart,checkout,
  orders,orders/[id]}/_{mobile,desktop}.tsx` + helpers
- แก้: `(admin)/layout.tsx`, `/admin/page.tsx`, `/admin/videos/page.tsx`,
  `/admin/reviews/page.tsx`, `(customer)/{profile,product/[id],cart,checkout,
  orders,orders/[id]}/page.tsx` → thin router pattern

### Smoke (live)
- typecheck ผ่าน (`pnpm exec tsc --noEmit`) ตลอด 14.0 → 14.6
- ไม่มี lint errors ในไฟล์ที่ทำใหม่
- ไม่กระทบ existing pages ที่ยังไม่ได้ทำ (เช่น `/local/*`, `/inbox`,
  `/search`) — ใช้ `container-mobile` เหมือนเดิม รอ Phase 14.x ถัดไป
  ถ้าจำเป็น

### Phase 14.x — future (queue)
- [ ] `/local/*` desktop split-pane (map left + store/menu right)
- [ ] `/feed/shop` desktop — เพิ่ม filters sidebar
- [ ] Keyboard shortcuts (`j/k` navigate orders list, `/` focus search)
- [ ] Merchant + Rider consoles → ใช้ admin sidebar pattern
- [ ] Auth pages (`/login`, `/signup`) — optional split hero on desktop

---

## Phase 15 — Mobile Native Shell (Capacitor) 🟢 done (2026-05-24)

> Goal: เปิด iOS / Android wrap ของ PWA โดยไม่เขียน UI ใหม่ — Capacitor 6
> static bundle + 11 native plugins + asset pipeline + bridge layer
>
> ดูคู่มือเต็ม + วิธีรัน + troubleshooting: [`docs/phase-15-mobile.md`](./phase-15-mobile.md)

### Decision points
- Hosting: **Static bundle** (`BUILD_STATIC=true`) — offline-first
- Auth: **Email + OTP** (ยังไม่ trigger Apple "Sign in with Apple" rule)
- Payment: **Physical commerce only** (Omise/PromptPay — ไม่ติด Apple IAP rule)
- Scope: **Full Phase 15** (scaffold + assets + bridge + manifest + docs)

### Deliverables
- [x] **15.1 `capacitor.config.ts` production-ready** — env-gated
  `allowMixedContent` · `iosScheme: 'NPCommerce'` · `server.allowNavigation`
  whitelist `*.np.app` · 8 plugin configs (Splash/StatusBar/Push/Preferences/
  Camera/Geolocation/App/Browser)
- [x] **15.2 Native shell scaffold** — `apps/web/ios/` (Xcode + Pods)
  + `apps/web/android/` (Gradle 8 + AndroidManifest) committed
- [x] **15.3 Brand asset pipeline**:
  - `apps/web/resources/{logo,splash}.svg` master vector
  - `scripts/build-mobile-assets.mjs` (sharp) → 1024 icon + 2732 splash
    + 6 PWA sizes (192/512/maskable-512/apple-touch/favicon-32/16)
  - `pnpm assets:generate` (@capacitor/assets) → 87 Android + 10 iOS
- [x] **15.4 Native bridge** (`apps/web/src/lib/native.ts`):
  - `isNative()` / `getPlatform()` synchronous (SSR-safe)
  - `safeStorage` — Preferences plugin on native, localStorage on web
  - `registerNativePush(token)` → existing `/v1/notifications/devices` (Phase 9.1)
  - `hideNativeSplash()` + `wireDeepLinks(push)` (`App.addListener('appUrlOpen')`)
  - `<NativeBridge authToken>` provider mount ใน `CustomerShell`
- [x] **15.5 Capacitor-aware env** (`lib/env.ts`) — บังคับใช้
  `NEXT_PUBLIC_API_URL` ใน native shell (WebView hostname = localhost)
- [x] **15.6 PWA + deep-link manifest**:
  - `manifest.json` `id` + `shortcuts` (4 launcher) + `share_target` +
    `related_applications`
  - `.well-known/apple-app-site-association` template (7 URL patterns)
  - `.well-known/assetlinks.json` template (Play App Signing fingerprint
    TODO)
  - `next.config.mjs` `headers()` → `Content-Type: application/json`
- [x] **15.7 `.gitignore`** — commit ios/android projects, ignore Pods/
  build/.gradle/keystores

### Smoke (live)
- `pnpm install` (+1280 pkgs, 70s)
- `pnpm assets:render` → 8 PNG, 1.0s
- `pnpm cap:add:ios` + `pnpm cap:add:android` (24ms total)
- `pnpm assets:generate` → 104 files, 11.2s
- `pnpm cap:sync` → 11 plugins ทั้ง iOS+Android, pod install 3.95s
- `pnpm typecheck` clean

### พร้อมรันแล้ว
```bash
cd apps/web
BUILD_STATIC=true pnpm build && pnpm cap:sync
pnpm cap:open:ios       # Xcode → Cmd-R simulator
pnpm cap:open:android   # Android Studio → Run
```

---

## Phase 16 — Native Capabilities Wiring 🟢 done (2026-05-24)

> Goal: ปลดล็อก native API ทีละชิ้น (push, camera, geo) — adapter ฝั่ง API
> มีพร้อมจาก Phase 9.1 + 10.1 อยู่แล้ว
>
> ดูคู่มือเต็ม: [`docs/phase-16-mobile-capabilities.md`](./phase-16-mobile-capabilities.md)

- [x] **Adapter** `apps/web/src/lib/native.ts` — `safeStorage`,
  `registerNativePush`, `getPushPermission`, `getCurrentPosition`,
  `nativeShare`, `openExternalUrl`, `getAppInfo`, `getDeviceInfo`,
  `getNetworkStatus`, `wireDeepLinks`, `hideNativeSplash` — ทั้งหมด
  dynamic import เพื่อ tree-shake fluentlyโดยไม่ลาก Capacitor SDK เข้า
  web bundle
- [x] Native push registration UI ใน `/profile/notifications`
  (Card "มือถือเครื่องนี้" แสดงสถานะ permission + ปุ่ม register manual)
- [x] **Refresh token** → `safeStorage` (Preferences plugin บน native /
  localStorage บน web) + migration ครั้งเดียวจาก localStorage
- [x] `/local` geolocation + Rider dashboard geolocation +
  `/merchant/local/[shopId]` → `Capacitor Geolocation` (พร้อม Android
  `ACCESS_BACKGROUND_LOCATION` ใน manifest สำหรับ Rider)
- [x] Universal Links / App Links wiring:
  - iOS `App.entitlements` (associated-domains + APNs env)
  - iOS Info.plist (purpose strings + custom scheme `npcommerce://`)
  - Android Manifest (`intent-filter android:autoVerify="true"` +
    permissions + queries)
- [x] App version check vs `/v1/app/version` → force-update screen
  (`AppVersionController` + `force-update-gate.tsx` mount ใน
  `NativeBridge`)
- [x] `@capacitor/share` swap — video-feed, profile, rewards,
  creator/links/[id] ใช้ `nativeShare()` แทน `navigator.share`
- [x] **`@capacitor/browser`** wrapper — `openExternalUrl()` พร้อมใช้
  สำหรับ external links (OmiseJS checkout, LINE OA, Store URL ของ
  force-update)
- [ ] **Deferred (Phase 16.x)**:
  - Camera plugin replacement สำหรับ `/feed/create` (input file capture
    ปัจจุบันใช้ได้บน Capacitor WebView แล้ว)
  - Static export refactor (Next 14.2 ไม่ resolve `generateStaticParams`
    ใต้ `'use client'` layouts) — ตอนนี้ Capacitor ใช้ `server.url` ชี้ไป
    staging URL แทน static bundle

## Phase 17 — Store Compliance + Submission 🟢 done — code side (2026-05-24)

> Goal: ขึ้น Closed Beta บน TestFlight + Internal Track ของ Play
>
> ดูคู่มือเต็ม: [`docs/phase-17-store-compliance.md`](./phase-17-store-compliance.md)
> · Store listing: [`docs/store-listing/README.md`](./store-listing/README.md)

### Code-side ✔ done

- [x] **Privacy Manifest** (`apps/web/ios/App/App/PrivacyInfo.xcprivacy`)
      ประกาศ UserDefaults, FileTimestamp, SystemBootTime, DiskSpace,
      ActiveKeyboards + 13 data types
- [x] **App Tracking Transparency** — `lib/native.ts` adapter +
      `<AttConsentGate>` pre-prompt sheet → `tracker.setConsent` mirror
- [x] **Account deletion** — schema migration + `account-deletion.{service,controller}.ts`
      + `DELETE /v1/me/account` (30-day grace) + sweeper +
      `<AccountDeletionCard>` ใน `/profile/privacy`
- [x] **Privacy policy + Terms** — `/legal/privacy` + `/legal/terms`
      (server components, public, ไทยล้วน)
- [x] **Demo account seeder** — `pnpm --filter api seed:reviewer` →
      `reviewer@np.app` / `NPReview2026!` idempotent + pre-seed cart
- [x] **Store listing assets** — `docs/store-listing/{apple,google,shared}/`
      copy TH+EN, keywords, Data Safety form, screenshot specs
- [x] **Login block** เมื่อ account pending deletion (auth.service.ts
      โยน `ACCOUNT_DELETION_PENDING` + `purgeAt`)

### Manual steps pending (ต้องคน + เงิน)

- [ ] Apple Developer Program ($99/y) + Google Play Console ($25)
- [ ] Bundle ID + provisioning profile + signing key + APNs `.p8`
- [ ] Capture screenshots 6.7"/12.9" iPad + Android phone+tablet
- [ ] Install `@capacitor-community/app-tracking-transparency` +
      `cap sync` (optional — adapter ทำงานแม้ไม่ install โดย fall back
      เป็น `'unsupported'`)
- [ ] Submit for review → Apple 24-48h · Google 1-7d
- [ ] Internal Testing → Closed Beta (50 user · 14 วัน) → Phased
      rollout 1% → 10% → 50% → 100%

### Deferred Phase 17.x

- [ ] Order anonymization แทน hard-delete (Thai e-Tax 5y retention)
- [ ] Sign in with Apple (ถ้าเพิ่ม Google/LINE login ใน Phase 18)
- [ ] Footer links `/legal/{privacy,terms}` ใน landing + checkout

## Phase 18 — Production Mobile Ops 🟢 done — code side (2026-05-24)

> Goal: เปิด pipeline deploy iOS/Android อัตโนมัติ + crash/ANR observability +
> OTA สำหรับ JS/CSS bug fix
>
> ดูคู่มือเต็ม: [`docs/phase-18-mobile-ops.md`](./phase-18-mobile-ops.md)
> · Secrets: [`docs/phase-18-secrets.md`](./phase-18-secrets.md)

### Code-side ✔ done

- [x] **Sentry Capacitor adapter** — `apps/web/src/lib/native-observability.ts`
      + bootstrap จาก `bootstrapNative` + `setNativeUser` hook ที่
      auth-store
- [x] **ANR / hang detection** — `anrEnabled` + `enableWatchdogTermination`
      ผ่าน Sentry-Cocoa + sentry-java (config ผ่าน env)
- [x] **Live Updates (OTA)** — `apps/web/src/lib/live-updates.ts`
      (checkAndApplyLiveUpdate / channel / rollback) +
      `apps/api/src/common/live-updates.controller.ts` `GET /v1/app/live-updates/manifest`
      พร้อม canary rollout (hash userId mod 100) + kill-switch env
- [x] **Native lifecycle → tracker** — `apps/web/src/lib/native-lifecycle.ts`
      ส่ง `app_open` / `app_background` / `app_resume` / `app_url_open` /
      `live_update_*` 7 kinds ใหม่ (ตรงทั้ง web + api + types pkg)
- [x] **GitHub Actions** — `.github/workflows/{mobile-ios,mobile-android,mobile-live-update}.yml`
      (TestFlight + Play Internal + S3 + manifest hook + Sentry release)
- [x] **Fastlane** — iOS `{Appfile,Matchfile,Fastfile,Pluginfile}` (lanes
      `beta` + `release`) · Android `{Appfile,Fastfile,Pluginfile}`
      (lanes `internal/alpha/beta/production`) · `Gemfile` ทั้งสองฝั่ง
- [x] **Secrets reference** — `docs/phase-18-secrets.md` (ครบทุก secret
      พร้อม pre-flight checklist + rotation schedule)

### Manual steps pending (ต้องคน + เงิน + bucket)

- [ ] Apple Developer Program ($99/y) + App Store Connect app record
- [ ] Google Play Console ($25) + first manual AAB upload (draft)
- [ ] Match repo (private) + first cert + push
- [ ] Android keystore + back-up offline (สูญหาย = update แอปไม่ได้ตลอดชีวิต)
- [ ] Play Service Account + Release Manager role
- [ ] Sentry org + 3 projects (web/ios/android) + alert rules
- [ ] S3 bucket OTA + CloudFront distribution + IAM user
- [ ] API host webhook endpoint สำหรับรับ `LIVE_UPDATES_*` env bump
- [ ] GitHub Environments (`ios-production` / `android-production` /
      `ota-production`) + required reviewers
- [ ] Install runtime plugins:
      ```
      pnpm --filter web add @sentry/capacitor @capacitor/live-updates
      pnpm cap sync
      ```

### Deferred Phase 18.x

- [ ] In-app upgrade soft banner (status=UPDATE_AVAILABLE) + OTA settings UI
      (channel switch, manual check)
- [ ] Sentry user feedback widget
- [ ] APM custom transactions (`checkout_flow`, `live_update_flow`)
- [ ] Webhook handler ฝั่ง API สำหรับ deploy hook (รับ HMAC-signed payload)
- [ ] Single workflow ทำ native build + OTA publish + version bump ใน
      run เดียว

---

## หลังจาก Phase 18: Scale + Compliance

- [ ] Extract Microservices ที่จำเป็น (Payment, Logistics, Search)
- [ ] Multi-region deployment (TH-primary + SG-DR)
- [ ] PDPA / GDPR / SOC2 readiness
- [ ] In-app payment WebView frame (Omise.js iframe หรือ Apple/Google Pay native)
