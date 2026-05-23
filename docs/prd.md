# NP Commerce OS — Product Requirements Document (PRD)

> **เอกสารฉบับนี้สรุปสเปกของระบบทั้งหมด ณ ปัจจุบัน** (Phase 0 → Phase 12.1 done)
> ใช้เป็น single source of truth สำหรับการปรับ **UX/UI ใหม่** + ไล่ฟังก์ชันก่อนทำ Phase 10.4+
>
> - Version: **v1.0** (2026-05-22)
> - Owner: NP / @ii
> - Status: 🟢 Build live (Phase 1–10.3) · 🟡 Phase 10.4+ ยังไม่เริ่ม
> - Companion docs: [`overview.md`](./overview.md) · [`architecture.md`](./architecture.md) · [`roadmap.md`](./roadmap.md) · [`structure-and-deploy.md`](./structure-and-deploy.md) · [`modules/`](./modules/) · [`decisions/`](./decisions/)

---

## 0. Document Control

| Field | Value |
|---|---|
| Document name | NP Commerce OS · Product Requirements Document |
| Codename | `np-commerce-os` |
| Audience | Product owner, Engineering, Design, QA, Ops |
| Source of truth | `docs/overview.md` (concept) + `docs/roadmap.md` (phases) + this file (requirements) |
| Change policy | แก้ scope ต้องทำ ADR ใน `docs/decisions/` ก่อน |

---

## 1. Vision

> **ร้านค้าเป็นเจ้าของการขาย · ลูกค้าซื้ออย่างมั่นใจ · Creator มีรายได้ · แพลตฟอร์มมี Data ของตัวเอง**

ใช้ TikTok / Social Media เป็นช่อง "ดึงลูกค้า" แต่ให้ **ระบบของเรา** เป็นศูนย์กลางในการ:
ปิดการขาย → รับเงิน (Escrow) → คุ้มครองผู้ซื้อ → จัดส่ง → เก็บ Data ลูกค้า → ตลาดซ้ำ → ลดการพึ่งพาแพลตฟอร์มเดียว

## 2. Mission (12 เดือนข้างหน้า)

1. ทำให้ **ร้านค้าไทยรายเล็กถึงกลาง** เปิดร้าน + ปิดการขายได้ **ในมือถือเครื่องเดียว** ไม่ต้องผูกกับ marketplace ใด
2. ทำให้ **ลูกค้า** ซื้อของออนไลน์/ของท้องถิ่นได้แบบ **มั่นใจ + เลือกขนส่งเองได้ + ได้ของส่งเร็ว**
3. สร้าง **AI personalisation layer** ที่อธิบายได้ (explainable) เคารพ privacy และไม่ผูกกับ vendor ใด
4. ใช้ **PWA-first + Capacitor** ขึ้น Native ได้เมื่อพร้อม โดยไม่ rewrite

---

## 3. ปัญหาที่ระบบแก้

### ฝั่งร้านค้า
- ค่าธรรมเนียมแพลตฟอร์มสูง · ไม่มี Data ลูกค้าเป็นของตัวเอง · Retarget ยาก
- ถูกผูกขาดด้านขนส่ง / ช่องทางขาย
- ขายผ่าน TikTok ได้แต่ต่อยอดไม่ได้ (ไม่มี CRM)

### ฝั่งลูกค้า
- กลัวโดนโกง · ไม่มั่นใจร้านเล็ก
- อยากเลือกขนส่งเอง · อยากซื้อง่าย เร็ว ปลอดภัย
- อยากได้โปรโมชัน / ของจากร้านใกล้บ้าน / ของน่าสนใจที่ตรงรสนิยม

### ฝั่ง Creator
- หาสินค้าโปรโมทยาก · Track ค่าคอมไม่ได้ · เงินมาช้า

### ฝั่ง Rider (Local)
- ตลาดผูกขาดไม่กี่เจ้า · ไม่มี dispatch อิสระสำหรับร้านอาหารเล็ก

---

## 4. Personas

| # | Persona | Role | Primary goal | Pain |
|---|---|---|---|---|
| 1 | **ลูกค้าออนไลน์** (`CUSTOMER`) | คนซื้อทั่วไป | ซื้อของออนไลน์ปลอดภัย เลือกร้านได้ | กลัวโดนโกง, ของไม่ตรงปก |
| 2 | **ลูกค้า Local** (`CUSTOMER`) | คนสั่งร้านอาหาร/ของใกล้บ้าน | สั่งของส่งด่วน นัดรับได้ | ร้านเล็กไม่อยู่ใน app ใหญ่ |
| 3 | **ร้านค้าออนไลน์** (`MERCHANT`) | SME / SOHO | เปิดร้าน + ขาย + ดู insights | เปิดร้านใน MP ใหญ่ค่าธรรมเนียมแพง |
| 4 | **ร้านค้า Local** (`MERCHANT` + `LOCAL_STORE`) | ร้านอาหาร/คาเฟ่/ตลาดสด | เปิดเมนู + slot booking + rider | ระบบสั่งอาหารผูกกับเจ้าใหญ่ |
| 5 | **Creator/Affiliate** (`CREATOR`) | คนดัง/นักรีวิว | สร้างลิงก์ขาย + ดูค่าคอม | track ไม่ได้ จ่ายช้า |
| 6 | **Rider** (`RIDER`) | คนส่งของท้องถิ่น | รับงาน → ส่งของ → รับเงิน | ตลาดงานจำกัด |
| 7 | **Admin** (`ADMIN`) | Ops + Risk team | Moderate · จัดการ dispute · ดู AI Ops | ต้องสลับหลาย tool |
| 8 | **CS** (admin role ย่อย) | ตอบลูกค้า | ตอบคำถาม + escalate ปัญหา | ตอบ FAQ ซ้ำๆ |

> ทุก persona ใช้ web (PWA) ตัวเดียวกัน แยกด้วย route group (`(customer)`, `(merchant)`, `(creator)`, `(rider)`, `(admin)`) + role check ใน guards

---

## 5. Product Principles

| # | Principle | นัยต่อ Design/Build |
|---|---|---|
| P1 | **Mobile-first, always** | ทุก UI ต้องใช้งานได้ที่ 360px เป็นต้นไป · safe-area iOS · 1-thumb reachable |
| P2 | **PWA before Native** | ใช้งานเหมือน app ผ่าน "Add to Home Screen" · ขึ้น Store ภายหลังด้วย Capacitor |
| P3 | **Trust-first** | Escrow + NP Protect + Dispute UI ต้อง prominent ตั้งแต่ checkout |
| P4 | **Privacy-first** | Behavioral tracking เป็น **opt-out** + transparent · มี `/profile/privacy` ที่ user ดู+ลบข้อมูลตัวเองได้ |
| P5 | **AI is explainable** | recommendation ทุกชิ้นมี reason badge · taste profile โชว์ให้ user เห็น |
| P6 | **No vendor lock-in** | LLM, push, storage, payment, shipping ใช้ adapter pattern เปลี่ยนเจ้าได้ |
| P7 | **One stack, multi-persona** | Customer/Merchant/Creator/Rider/Admin ใช้ codebase + auth เดียว |
| P8 | **Local-aware** | Geo-search, slot booking, NP Rider เป็นพลเมืองชั้นหนึ่ง ไม่ใช่ส่วนเสริม |
| P9 | **Deterministic before LLM** | ทุก AI feature ต้องมี deterministic baseline · LLM เป็น "rephrase/rerank" เท่านั้น |
| P10 | **Idempotent + observable** | ทุก side-effect (push, broadcast, dispatch) ต้อง dedupe ledger + log `model_runs` / `notification_logs` |

---

## 6. Goals & Non-Goals

### Goals (Now → Phase 11)

- **G1**: ระบบ end-to-end commerce (order/payment/shipping/dispute/refund) ใช้งานจริงได้บนมือถือ ✅ done
- **G2**: รองรับ **Local Commerce** (ร้านอาหาร/ตลาด) ที่มี geo + slot + NP Rider ✅ done
- **G3**: มี **Marketing Engine** ที่ร้านส่ง broadcast/coupon/flash deal/short video ได้เอง ✅ done
- **G4**: มี **AI personalisation** ที่ explainable + privacy-respecting ✅ Phase 10.1–10.3 done
- **G5**: ระบบ **CS chatbot + admin handoff** ใช้งานจริง ✅ Phase 9.3 done
- **G6**: รองรับ **multi-channel notifications** (in-app, web push, FCM/APNs, email, LINE) ✅ Phase 9.1 done
- **G7**: ปรับ **UX/UI** ใหม่ทั้งระบบให้สม่ำเสมอ + scale ไป native ได้ 🟡 **next**
- **G8**: เริ่ม **Evaluation framework** (A/B + lift) สำหรับ AI surfaces 🟡 Phase 10.4 (next)
- **G9**: ขึ้น Native app (Capacitor → APK/IPA) + เผยแพร่ Play/App Store 🔵 backlog

### Non-Goals (ตอนนี้)

- ❌ Live streaming commerce แบบ realtime video (Phase 11+)
- ❌ Cross-border / multi-currency (เน้นไทย/THB ก่อน)
- ❌ B2B wholesale module
- ❌ Marketplace tax invoicing (รอ partner)
- ❌ Self-hosted vector DB (ใช้ TF-IDF จนกว่า catalog > 10k SKU)

---

## 7. North-Star + KPI

### North-Star
**GMV ที่ปิดในแพลตฟอร์ม ÷ ค่าธรรมเนียม + Refund rate** = "ระบบสร้างมูลค่าให้ร้านสุทธิเท่าไหร่"

### Tier-1 KPIs (track ทุกเดือน)

| Layer | KPI | Target (Y1 launch) |
|---|---|---|
| Growth | DAU/MAU | ≥ 25% |
| Acquisition | Signup → first order conversion | ≥ 30% (lifetime) |
| Engagement | Sessions/user/week | ≥ 3.0 |
| Commerce | GMV / month | growth-mode (ตั้งหลัง launch) |
| Commerce | AOV | tracked, no hard target |
| Commerce | Order completion rate (PAID→DELIVERED) | ≥ 92% |
| Trust | Dispute rate | ≤ 2% |
| Trust | Refund time (mean) | ≤ 48h |
| Marketing | Broadcast open rate (segment-aware) | ≥ 20% |
| Marketing | Push opt-in rate | ≥ 40% |
| AI | For-You CTR | uplift vs popularity baseline ≥ +15% |
| AI | Recommendation reason coverage | 100% (no "unknown") |
| AI | Chatbot deflection rate (no human needed) | ≥ 60% |
| Local | Rider dispatch ≤ 5min | ≥ 80% |
| Reliability | API p95 latency | < 300ms |
| Reliability | Web LCP (mobile, 4G) | < 2.5s |
| Privacy | Behavioral opt-out churn | track only (target n/a) |

### Tier-2 (per surface)
- Feed rails: impression → click rate per rail
- Nudges: open rate, dismiss rate, attributed GMV (Phase 10.4)
- Search: zero-result rate (target ≤ 8%), trending recall

---

## 8. Information Architecture

### 8.1 Route Map (Web · Next.js App Router)

> ทุก route group ใช้ `apps/web/src/app/` แชร์ layout + auth กับ persona ที่ login

#### Customer (`(customer)`)

| Route | หน้าจอ | สถานะ |
|---|---|---|
| `/` | Landing (Phase 1 marketing) | done |
| `/feed` | **Phase 12 — TikTok-style vertical short-video reel** (full-bleed, one-clip-at-a-time, infinite scroll, like/share/save, product CTA pill, desktop phone-frame + side panel) | done |
| `/feed/shop` | Commerce home (formerly `/feed`): bento promo + AI For You, Trending, Personalised rails (Phase 10.3) + product grid | done |
| `/feed/videos` | Legacy alias → 307 redirect to `/feed` (preserves `?v=<id>`) | done |
| `/search` | Search (autocomplete + filter + recents) | done |
| `/product/[id]` | PDP (รูป/ราคา/รีวิว+gallery/recommend similar) | done |
| `/local` | Local stores ใกล้ฉัน (geo) | done |
| `/local/[shopId]` | Local store page (เมนู + slot booking) | done |
| `/cart` | Cart multi-shop split | done |
| `/checkout` | Smart Checkout (1-page) | done |
| `/orders` | Order list + Buy Again strip | done |
| `/orders/[id]` | Order detail + write review + tracking | done |
| `/disputes` | Dispute list | done |
| `/disputes/[id]` | Dispute detail + reply | done |
| `/rewards` | Coupons + loyalty + referral | done |
| `/inbox` | In-app messages (broadcasts) | done |
| `/profile/notifications` | Push/Email/LINE prefs + test | done |
| `/profile/privacy` | Behavioral tracking opt-out + taste profile + delete | done |

#### Merchant (`(merchant)`)

| Route | หน้าจอ | สถานะ |
|---|---|---|
| `/merchant/dashboard` | KPI overview + recent orders | done |
| `/merchant/products` | สินค้าทั้งหมด | done |
| `/merchant/products/new` | สร้างสินค้าใหม่ | done |
| `/merchant/orders` | ออเดอร์ + จัดส่ง | done |
| `/merchant/disputes` | Dispute pending action | done |
| `/merchant/wallet` | กระเป๋าตังร้าน · escrow ledger · ถอน | done |
| `/merchant/insights` | KPI 30d + RFM + forecast + creator match | done |
| `/merchant/local` | สำหรับ Local Store (Phase 4) | done |
| `/merchant/local/[shopId]` | ตั้งค่าร้านท้องถิ่น (พิกัด + เวลา + เมนู) | done |
| `/merchant/marketing` | Hub: coupons/campaigns/broadcasts/videos | done |
| `/merchant/marketing/coupons` | สร้าง/จัดการคูปอง | done |
| `/merchant/marketing/campaigns` | Boost / Flash Deal | done |
| `/merchant/marketing/broadcasts` | ส่ง broadcast (รวม channel + segment) | done |
| `/merchant/marketing/videos` | จัดการ short video | done |

#### Creator (`(creator)`)

| Route | หน้าจอ | สถานะ |
|---|---|---|
| `/creator/dashboard` | สรุปคลิก/ยอดขาย/ค่าคอม | done |
| `/creator/links` | สร้างลิงก์ขาย + QR | done |
| `/creator/links/[id]` | สถิติของลิงก์ | done |
| `/creator/wallet` | ค่าคอมรอ/รับแล้ว · ถอน | done |
| `/apply-creator` | สมัครเป็น Creator (public) | done |
| `/r/[code]` | Redirect referral link → product/shop + track click | done |

#### Rider (`(rider)`)

| Route | หน้าจอ | สถานะ |
|---|---|---|
| `/rider/dashboard` | online toggle + open jobs | done |
| `/rider/jobs/[id]` | งาน: pickup → deliver | done |
| `/apply-rider` | สมัครเป็น Rider (public) | done |

#### Admin (`(admin)`) — gate ด้วย role=ADMIN

| Route | หน้าจอ | สถานะ |
|---|---|---|
| `/admin` | Hub + tiles | done |
| `/admin/risk/shops` | Shop risk score + factors | done |
| `/admin/risk/orders` | Suspicious orders | done |
| `/admin/risk/logistics` | Carrier late rate / lead time | done |
| `/admin/reviews` | Review moderation + hide photo | done |
| `/admin/search` | Trending + zero-result | done |
| `/admin/ai-ops` | model_runs latency/p95/fail rate | done |
| `/admin/chat` | CS console (filter REQUESTED/HUMAN, reply) | done |
| `/admin/events` | Firehose KPI byKind/bySurface | done |

#### Auth (`(auth)`)

| Route | หน้าจอ | สถานะ |
|---|---|---|
| `/login` | Email + password (JWT) | done |
| `/signup` | สมัคร + รับ referral code | done |

### 8.2 Tab bar / shell ที่แนะนำ (สำหรับ UX redesign)

**Customer (default shell) — post Phase 12**

*Mobile bottom-nav (5 tabs):*
```
┌─────────────────────────────────────┐
│ ฟีด │ ช้อป │ ตะกร้า │ ใกล้ฉัน │ ฉัน │
└─────────────────────────────────────┘
```
- `ฟีด` = `/feed` — **TikTok-style vertical short-video reel** (immersive, hides mobile header,
   bottom nav becomes translucent dark glass)
- `ช้อป` = `/feed/shop` — commerce home (bento + product grid + AI rails)
- `ตะกร้า` = `/cart` (badge = item count)
- `ใกล้ฉัน` = `/local` (geo store list)
- `ฉัน` = `/profile/*` (covers orders, rewards, privacy, settings)

*Desktop top-bar (≥lg):*
- Logo · ฟีด · ช้อป · ใกล้ฉัน · คำสั่งซื้อ · wide search · theme · inbox · cart · profile

Floating: ChatBubble (`ChatWidget` — hidden on `/feed` so it doesn't obscure product CTA),
Notification bell (after Phase 10.4 inbox UI)

**Merchant shell**
```
┌────────────┐
│ Dashboard │ Orders │ Products │ Marketing │ More │
└────────────┘
```

**Creator shell**
```
┌────────────┐
│ Dashboard │ Links │ Wallet │
└────────────┘
```

**Rider shell**
```
┌────────────┐
│ Online toggle │ Jobs │ Wallet │
└────────────┘
```

**Admin** — ใช้ desktop-first table layout (admin มัก work บนเดสก์ทอป) — มือถือ readable แต่ไม่ optimise

### 8.3 API Surface (`/v1/*`)

> 32 controllers, สรุปกลุ่ม:

| กลุ่ม | Path | Module |
|---|---|---|
| Auth | `/v1/auth/*` | `auth` |
| User | `/v1/users/*`, `/v1/me/*` | `user`, `events` (privacy), `taste`, `proactive` |
| Catalog | `/v1/products/*`, `/v1/shops/*` | `catalog`, `merchant` |
| Cart/Checkout | `/v1/cart/*`, `/v1/checkout/*` | `cart`, `checkout` |
| Payment | `/v1/payment/*` | `payment` |
| Order | `/v1/orders/*` | `order` |
| Dispute | `/v1/disputes/*` | `dispute` |
| Logistics | `/v1/logistics/*` | `logistics` |
| Local | `/v1/local/*`, `/v1/rider/*` | `local`, `rider` |
| Marketing | `/v1/coupons/*`, `/v1/campaigns/*`, `/v1/broadcasts/*`, `/v1/loyalty/*`, `/v1/referral/*`, `/v1/feed/*` | (หลายโมดูล) |
| Reviews | `/v1/reviews/*` | `review` |
| Search | `/v1/search/*` | `search` |
| Creator | `/v1/creator/*` | `creator` |
| Wallet | `/v1/wallet/*` | `wallet` |
| Notifications | `/v1/notifications/*` | `notification` |
| Storage | `/v1/storage/*` | `storage` |
| Chat | `/v1/chat/*` | `chat` |
| Events | `/v1/events/*` | `events` |
| Recommendation | `/v1/recommendations/*` | `recommendation` |
| Proactive feed | `/v1/me/feed/*`, `/v1/me/nudges` | `proactive` |
| Taste | `/v1/me/taste/*` | `taste` |
| Insights | `/v1/insights/*` | `insights` |
| Risk | `/v1/risk/*` | `risk` |
| AI Ops | `/v1/aiops/*` | `aiops` |
| Health | `/v1/health` | `common/health` |

---

## 9. Feature Catalog (ภาพรวม + สถานะ)

> 🟢 done · 🟡 partial / รอ wire · 🔵 spec / backlog

### 9.1 Customer Platform

| Feature | สถานะ | Phase | หมายเหตุ |
|---|---|---|---|
| Browse + PDP | 🟢 | 1 | ราคา/ภาพ/รีวิว/related |
| Cart (multi-shop split) | 🟢 | 1 | |
| Smart Checkout | 🟢 | 1, 4 | รองรับ pickup/slot/delivery |
| Payment (PromptPay QR) | 🟡 | 1.5 | mock confirm; ต้องเปลี่ยน Omise/2C2P จริง |
| Order tracking | 🟢 | 2 | mock advancement → real webhook ต้องทำ |
| Reviews + photo + helpful | 🟢 | 7, 9.2 | gallery + lightbox |
| Disputes / refund | 🟢 | 2 | |
| Rewards (coupons/loyalty/referral) | 🟢 | 5 | |
| Short video feed | 🟢 | 5 | |
| Search (TF-IDF + filter) | 🟢 | 8 | upgrade Meili หลัง catalog > 10k |
| AI For You + reason badge | 🟢 | 6, 10.2 | |
| Buy Again | 🟢 | 6 | |
| Similar products | 🟢 | 6.1 | |
| Trending rail | 🟢 | 6.1 | |
| Personalised rails (recently viewed, fav shops, bargains, similar to recent) | 🟢 | 10.3 | |
| Proactive bar (currentlyViewing + lastSearch) | 🟢 | 10.3 | UI rendering รอ wire เพิ่ม |
| Chatbot widget + context-aware | 🟢 | 9.3, 10.3 | |
| In-app inbox | 🟢 | 5, 9.1 | |
| Web Push subscription | 🟢 | 9.1 | iOS 16.4+, Android |
| LINE link | 🟢 | 9.1 | UI ที่ profile/notifications |
| Privacy + taste transparency | 🟢 | 10.1, 10.2 | |
| In-app nudge inbox badge UI | 🔵 | 10.4 | backlog |

### 9.2 Merchant Platform

| Feature | สถานะ | Phase | หมายเหตุ |
|---|---|---|---|
| Shop signup + onboarding | 🟢 | 1 | KYC ผิวๆ |
| Product CRUD + image | 🟢 | 1 | |
| Order fulfilment dashboard | 🟢 | 1 | |
| Wallet + escrow ledger + withdraw | 🟢 | 2 | |
| Carrier selector (6 carriers seed) | 🟢 | 2 | |
| Local store: พิกัด + เวลาทำการ + เมนู + slot | 🟢 | 4 | |
| Auto-dispatch NP Rider (EXPRESS_LOCAL) | 🟢 | 4 | |
| Coupons engine | 🟢 | 5 | |
| Campaigns (Boost / Flash deal) | 🟢 | 5 | |
| Broadcasts (multi-channel + RFM segment + preview) | 🟢 | 5, 6.2, 9.1 | |
| Short video upload | 🟢 | 5 | |
| Insights (KPI/Trend/Top/Anomaly/Forecast/Creator match) | 🟢 | 6, 6.1, 6.2 | |
| Dispute response | 🟢 | 2 | |
| Avg rating tile | 🟢 | 7 | |
| Scheduled broadcasts (queue) | 🔵 | 9.4+ | backlog |
| Stock alert + back-in-stock event | 🔵 | 10.4 | backlog |

### 9.3 Creator / Affiliate

| Feature | สถานะ | Phase | หมายเหตุ |
|---|---|---|---|
| Creator onboarding | 🟢 | 3 | KYC ผิวๆ |
| Generate short link + QR | 🟢 | 3 | |
| Click tracking (cookie + localStorage 30d) | 🟢 | 3 | |
| Commission engine (basis points) | 🟢 | 3 | |
| Auto-deduct จาก escrow ตอน release | 🟢 | 3 | |
| Reverse commission ตอน refund | 🟢 | 3 | |
| Creator dashboard + wallet | 🟢 | 3 | |
| Anti-fraud (self-ref / click farm) | 🔵 | 6.x AI | backlog |

### 9.4 Rider (Local)

| Feature | สถานะ | Phase | หมายเหตุ |
|---|---|---|---|
| Apply + onboarding | 🟢 | 4 | |
| Online toggle + accept job | 🟢 | 4 | |
| Pickup → deliver flow | 🟢 | 4 | |
| Realtime map tracking (websocket) | 🔵 | 4.5 | backlog |
| Fallback dispatch (Grab/Lalamove) | 🔵 | 4.5 | backlog |

### 9.5 Admin / Ops

| Feature | สถานะ | Phase | หมายเหตุ |
|---|---|---|---|
| Risk Shop / Order / Logistics | 🟢 | 6 | |
| Review moderation + hide photo | 🟢 | 7, 9.2 | |
| Search analytics (trending + zero-result) | 🟢 | 8 | |
| AI Ops (latency/p95/fail) | 🟢 | 6.2 | |
| Chat console | 🟢 | 9.3 | |
| Events firehose KPI | 🟢 | 10.1 | |
| Manual proactive sweep trigger | 🟢 | 10.3 | |

### 9.6 Cross-cutting

| Feature | สถานะ | Phase | หมายเหตุ |
|---|---|---|---|
| Auth (JWT email/password) | 🟢 | 1 | OTP Phase 1.5 |
| Storage (S3/R2/MinIO presign zero-dep SigV4) | 🟢 | 9.2 | |
| Notifications (InApp/WebPush/FCM/APNs/Email/LINE) | 🟢 | 9.1 | |
| Event firehose | 🟢 | 10.1 | |
| Taste profile | 🟢 | 10.2 | |
| Proactive surfaces | 🟢 | 10.3 | |
| Evaluation framework (A/B + lift) | 🔵 | 10.4 | **next** |
| PWA (manifest + SW + offline basic) | 🟢 | 1 | |
| Capacitor scaffolding | 🟢 | 1.5 | ขึ้น Store ภายหลัง |

---

## 10. Core Flows (end-to-end)

### 10.1 Customer "browse → buy → review"

```
Open / → /feed (TikTok reel)
  ↳ track session_start, page_view, video_play (first paint per clip)
  ↳ render: vertical snap-scroll of video_posts (8 demo seed → real merchants)
  ↳ Product CTA pill in each clip → /product/[id]
  ↳ "ช้อป" tab → /feed/shop (For You ranker + Trending + Personalised rails 10.3)

Tap product → /product/[id]
  ↳ track product_view + dwell(30s) + scroll(75%)
  ↳ render: gallery + ราคา + RatingPill + Reviews + Similar
  ↳ Bot greeting "เห็นกำลังดูสินค้า — ให้ช่วยอะไรไหม?"

Add to cart → /cart
  ↳ track add_to_cart
  ↳ cart split per shop

Checkout → /checkout
  ↳ track checkout_start
  ↳ pick address + carrier (or pickup/slot if local)
  ↳ quote shipping + coupons + loyalty redeem
  ↳ generate PromptPay QR (Phase 1.5: real Omise)

Payment confirm → /orders/[id]
  ↳ track purchase per order
  ↳ funds → escrow ledger (Phase 2)
  ↳ logistics dispatch (Phase 2/4)
  ↳ optional: rebuild taste profile

Delivery
  ↳ webhook → status update → notification (multi-channel)
  ↳ DELIVERED → review reminder cron (72-168h)

Review (DELIVERED+)
  ↳ /orders/[id] → WriteReviewForm (star + text + photos ≤5)
  ↳ Fake-review heuristics + photo SHA dedupe
```

### 10.2 Merchant "open shop → sell → grow"

```
Signup → /merchant/dashboard
  ↳ KPI + recent orders

Create product → /merchant/products/new
  ↳ presign upload (Phase 9.2) → S3/R2/MinIO

Receive order → push/email
  ↳ /merchant/orders → ship → carrier label/tracking

Get review → +rating + risk factor update

Marketing → /merchant/marketing
  ↳ Insights → identify SEG_AT_RISK customers
  ↳ Broadcast (PUSH + EMAIL + LINE) → segment → live audience preview → send
  ↳ Coupon + flash deal + short video

Insights → /merchant/insights
  ↳ KPI 30d, RFM, forecast 7d, creator match
```

### 10.3 Creator "apply → promote → earn"

```
/apply-creator → /creator/dashboard
  ↳ Create link → short code + QR (Phase 3)
  ↳ Share to TikTok/IG
  ↳ User คลิก → /r/[code] → track + redirect → product
  ↳ User ซื้อ → commission accrue (basis points)
  ↳ Payment release (escrow) → auto-deduct → creator wallet
```

### 10.4 Rider "online → accept → deliver"

```
/apply-rider → /rider/dashboard
  ↳ Toggle online (geo permission)
  ↳ Open jobs (carrier = EXPRESS_LOCAL)
  ↳ Accept → pickup → deliver
  ↳ Wallet entry
```

### 10.5 CS "question → bot → handoff"

```
ChatBubble (any page) → /v1/chat/messages
  ↳ Intent classifier (TH/EN regex) → tool
  ↳ Tool result (order/dispute/policy) → LLM rephrase (optional)
  ↳ Suggested actions chips
  ↳ User: "คุยกับคน" → handoffStatus=REQUESTED → notify admin
  ↳ Admin (/admin/chat) ตอบ + ปิดเคส
```

### 10.6 AI personalisation loop

```
User action → /v1/events/batch (anon ok)
  ↳ EventsService.ingestBatch (consent gate)
  ↳ notifyListeners → TasteWorker queue
  ↳ TasteWorker tick 30s → rebuildFor(userId)
  ↳ user_profiles updated

User opens /feed → /v1/recommendations/for-you
  ↳ forYou2(): blend 5 signals + MMR diversity + reason mapping
  ↳ optional LLM rerank (top-30 → top-10) with hallucination guard
  ↳ render with ReasonBadge

Async (cron)
  ↳ Proactive sweepers (every 4-24h) → check candidates
  ↳ Dedupe ledger + cooldown → fire via NotificationService (topic=PROMOTIONAL)
```

---

## 11. Data Model (high-level)

> Schema neutral SQLite (dev) ↔ Postgres (prod) ผ่าน Prisma + ตารางเสริม runtime ด้วย `bootstrap-phaseX.ts`

### 11.1 Prisma-managed (`apps/api/prisma/schema.prisma`)

หลัก: `User`, `Shop`, `Product`, `ProductImage`, `Order`, `OrderItem`, `Payment`, `EscrowLedger`, `Dispute`, `Shipment`, `Address`, `Carrier`, `LoyaltyAccount`, `Coupon`, `CouponRedemption`, `Campaign`, `CampaignProduct`, `Broadcast`, `BroadcastRecipient`, `ReferralCode`, `CreatorLink`, `CreatorClick`, `WalletEntry`, `VideoPost`, `LocalStore`, `MenuCategory`, `MenuItemMap`, `TimeSlot`, `Rider`, `DeliveryJob`, `Review`, `SearchQuery`, `ProductView`, `ModelRun`

### 11.2 Runtime-bootstrapped (raw SQL, idempotent)

- Phase 9.1: `push_subscriptions`, `user_devices`, `line_links`, `notification_prefs`, `notification_logs`
- Phase 9.2: `storage_uploads`, `review_photos`, `review_helpfuls`, `reviews.helpfulCount` (additive)
- Phase 9.3: `chat_conversations`, `chat_messages`
- Phase 10.1: `user_events`, `user_sessions`, `user_consents`
- Phase 10.2: `user_profiles`
- Phase 10.3: `proactive_nudges`, `product_price_history`

### 11.3 Money & i18n
- ทุก amount เก็บเป็น `Int` cents (THB ตอนนี้)
- text เก็บ UTF-8 ตามจริง · search ทำ TH-aware tokenize ใน TF-IDF
- timezone: server เก็บ UTC, client render `Asia/Bangkok`

---

## 12. AI / Personalisation Layer

```
User Actions
   ↓ (sendBeacon)
EventsService.ingestBatch  ──→  notifyListeners
   ↓ DB                            ↓
user_events                    TasteWorker queue
                                   ↓ tick 30s
                                TasteService.rebuildFor
                                   ↓
                                user_profiles (denormalised)
                                   ↓
RecommendationService.forYou2 ←────┘
   ↓ (5 signals + MMR diversity + reason)
[ optional ] LLM rerank top-30 → top-10
   ↓ (hallucination guard)
Recommendation strip + ReasonBadge

ProactiveService (every 4-24h cron)
   ↓ rails for /feed                ↓ sweep nudges
RECENTLY_VIEWED                    BROWSE_ABANDON
FAV_SHOPS_NEW                      CART_ABANDON
BARGAINS_FROM_BROWSE               WIN_BACK
SIMILAR_TO_RECENT                  PRICE_DROP
                                   FAV_SHOP_NEW_ARRIVAL
                                   ↓
                                NotificationService (topic=PROMOTIONAL)
                                   ↓
                                proactive_nudges ledger + cooldown
```

**Determinism budget**
- Default flow: 100% deterministic (TF-IDF, RFM, gaussian price match, decay)
- LLM ใช้เฉพาะ "rephrase" (chatbot) และ "rerank" (recommendation) เปิด/ปิดได้ผ่าน env
- ทุก LLM call timeout 4s + fallback ทันที + log `model_runs`

---

## 13. Notification Framework

### 13.1 Adapters (Phase 9.1)
`InApp` · `WebPush(VAPID)` · `FCM` · `APNs` · `Email(Resend+SMTP)` · `LINE OA`

ทุก adapter โหลด lib แบบ **dynamic require** — boot ได้แม้ยังไม่ติดตั้ง

### 13.2 Topics
`TRANSACTIONAL` (bypass opt-out) · `PROMOTIONAL` (respect opt-out) · `SYSTEM`

### 13.3 Preferences matrix (per user × channel × topic)
- Default ON
- TRANSACTIONAL bypass opt-out (เช่น payment confirm, ship update, dispute)
- PROMOTIONAL ใช้ proactive nudge ต้องเช็คทั้ง consent (10.1) + per-topic pref (9.1)

### 13.4 Concurrency + idempotency
- Concurrency-limited fan-out (default 8)
- `notification_logs.providerMessageId` ใช้ดีดูปลิเคต (e.g. review reminder `rr:<orderId>`, proactive `proactive_nudges` ledger)

---

## 14. Privacy Framework

### 14.1 Behavioral consent (Phase 10.1)
- Default: opt-out model (ติดตามจนกว่าจะปิด)
- Toggle ใน `/profile/privacy`
- ConsentService cache 30s, sync ทันทีจาก client ด้วย `np_consent` localStorage
- Server-side bypass: `ingestBatch` short-circuit ถ้า opted-out

### 14.2 Retention
- `EVENT_RETENTION_DAYS` (default 180, floor 30)
- User-level override (30/90/180/365/730)
- Retention cron ทุก 6h

### 14.3 Right to inspect + delete (GDPR/PDPA-aligned)
- `GET /v1/me/events` → ดูล่าสุด 50 events
- `DELETE /v1/me/events` → ลบ user_events + sessions ของฉันทั้งหมด
- `GET /v1/me/taste` → ดูสิ่งที่ระบบเรียนรู้
- `DELETE /v1/me/taste` → รีเซ็ตโปรไฟล์

### 14.4 PII boundaries
- Auth ID เป็น cuid (ไม่ใช่ sequential)
- Logging: ไม่ log password/token/PII ใน `model_runs`/`notification_logs`
- Anon profile → user profile stitch ตอน login ผ่าน `linkAnonToUser`

---

## 15. Non-Functional Requirements

### 15.1 Performance
- API p95 < 300ms (warm), 500ms (cold)
- Web LCP < 2.5s บน mobile 4G (target)
- Recommendation feed first paint < 1s (cache + ssr)
- Event ingest < 50ms (multi-VALUES bulk insert)

### 15.2 Availability
- API 99.5% (single-region launch)
- Background workers idempotent (taste, proactive sweeps, retention)
- Outage: degrade gracefully (cold-start ranker, in-app only notifications)

### 15.3 Security
- JWT (HS256) secret rotation policy
- All `presigned PUT` มี expires 10min + content-type allowlist + size cap
- Adapter pattern กัน vendor leak (api key อยู่ใน env เท่านั้น)
- AdminGuard บนทุก admin endpoint
- CSRF: Next.js + Fastify same-origin cookies (ตอนนี้ใช้ Bearer header)

### 15.4 Privacy / Compliance
- PDPA-aligned: consent + retention + delete
- Cookie banner สำหรับ EU (รอก่อน launch global)

### 15.5 Accessibility
- Target WCAG 2.1 AA สำหรับ customer pages
- Color contrast ≥ 4.5:1 บน body text
- Touch target ≥ 44×44 pt (iOS HIG)

### 15.6 i18n
- Default: ไทย (primary), English (mixed)
- Currency: THB stored as cents (Int)
- Date/time: `Asia/Bangkok` UI rendering
- No translation system yet (string ฝังใน component) — backlog

### 15.7 Mobile build
- PWA installable + offline basic
- Service worker (`/sw.js` from next-pwa + `/sw-push.js` for push)
- Capacitor scaffolded (apps/web/capacitor.config.ts)
- iOS safe-area + Android edge-to-edge

---

## 16. Tech Architecture (สรุปสั้น)

```
┌──────────────────────────────────────────────────────────────┐
│ Web (Next.js 14 App Router + PWA + Tailwind + RQ + Zustand)  │
│   - apps/web/                                                 │
└──────────────────────────────────────────────────────────────┘
                          │  REST (JWT bearer) + sendBeacon
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ API (NestJS 10 + Fastify)                                    │
│   - apps/api/                                                 │
│   - bootstrap-phaseN.ts runs raw SQL on boot (idempotent)     │
│                                                               │
│  Modules: auth · user · merchant · catalog · cart · checkout │
│   payment · order · dispute · logistics · local · rider ·    │
│   review · search · coupon · campaign · broadcast · creator ·│
│   referral · loyalty · wallet · feed · notification ·        │
│   storage · chat · events · taste · recommendation ·         │
│   proactive · insights · risk · aiops                        │
└──────────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┼──────────────┐
            ▼             ▼              ▼
        Prisma          Cron        Adapters (dynamic require)
        (SQLite dev /   (review     web-push · firebase-admin ·
         Postgres prod) reminder ·  nodemailer · apn · LINE ·
                        proactive   S3 SigV4 · OpenAI/Anthropic
                        sweeps ·    (fetch)
                        retention)
```

**Shared packages**
- `packages/types/` — Zod schemas + TS types (single source of truth)
- `packages/sdk/` — typed API client (optional)
- `packages/ui/` — shared React (shadcn/ui based) [จะเติม pattern ใน UX redesign]
- `packages/config/` — eslint/prettier/tsconfig กลาง

**Infra**
- Local dev: SQLite + dynamic provider mocks
- Prod path: Vercel (web) + Railway/Fly (api) + Postgres (Neon/Supabase) + Cloudflare R2 + Redis (when needed)

---

## 17. UX/UI Direction (proposal สำหรับการปรับใหม่)

> เป้าหมาย: ทำให้ทุก persona มี UI กลางที่ feel เหมือน "native app", consistent, scalable, fast

### 17.1 Foundation

- **Design System**: เก็บไว้ใน `packages/ui` (shadcn/ui + tailwind) — tokens + primitives + composed patterns
- **Color**: brand gradient หลัก (มีอยู่แล้วใน landing) + ink-scale + accent (cyan/violet/amber) + semantic (success/warn/danger/info)
- **Type scale**: Mobile-first 14/16/18/24/32/40 พร้อม line-height + tracking ที่ปรับมาแล้ว
- **Spacing**: 4/8/12/16/24/32 (Tailwind default ใช้ได้)
- **Radius**: 8 / 16 / 24 / 32 (ปัจจุบันใช้ rounded-2xl เป็น default)
- **Shadow**: card (subtle) · pop (medium) · glow (brand-tinted) — preset ใน Tailwind config แล้ว
- **Motion**: 150-250ms ease-out สำหรับ tap · 400-600ms cubic-bezier สำหรับ enter · spring สำหรับ sheet
- **Iconography**: ชุดเดียวกัน (`@/components/icons`) — stroke 1.5px

### 17.2 Component patterns ที่จะ standardise

- AppShell (header + content + bottom-tab + safe-area)
- Sheet / Drawer (Cart drawer, Notification inbox)
- Bottom sheet sticky CTA (PDP, checkout)
- ListItem (order, product, review) ที่มี skeleton state เดียวกัน
- EmptyState (search zero / no order / no review)
- ReasonBadge / RatingPill / Chip / Tag
- Form: floating label + error inline
- Modal: stacked z-index แม่นยำ
- Toast: success / error / info ที่กดเข้าหน้าที่เกี่ยวข้องได้

### 17.3 Persona theming

- Customer = brand gradient หลัก
- Merchant = neutral ink (focus on data density)
- Creator = brand + warm accent (vibe creator)
- Rider = high-contrast (ใช้กลางแจ้ง)
- Admin = desktop dashboard density (mono headers, tables)

### 17.4 Accessibility checklist
- Focus ring บนทุก interactive
- ARIA สำหรับ sheet/dialog/menu
- Screen reader label สำหรับ icon-only button
- Reduced-motion support

### 17.5 What needs to be redone (proposed scope)

| Area | ปัจจุบัน | เป้าหมายใหม่ |
|---|---|---|
| Landing `/` | rich marketing | ตัดเหลือ hero + CTA + เรียงโครงเดียวกับ feed (เคารพ AppShell) |
| Bottom tab bar | ไม่มี (header-only nav) | เพิ่ม tab bar ต่อ persona |
| PDP | scroll long | sticky CTA + sticky tabs (รายละเอียด/รีวิว/ร้าน/อื่นๆ) |
| Feed | rail หลายอัน | reordering + lazy load + skeleton + reason badge ใหญ่ขึ้น |
| Checkout | 1-page | step indicator + sticky total + autosave |
| Merchant dashboard | KPI cards | density layout + tabs (Sales/Operations/Marketing) |
| Admin pages | utilitarian | shared admin shell + filter bar + table primitive |
| Chat widget | floating bubble | sheet-style + context header + quick actions ใหญ่ขึ้น |
| Privacy page | scroll long | tabbed (consent / taste / data export / delete) |

> รายละเอียดของ UX redesign ขอแยกเป็น **PRD-UX** อีกไฟล์หลังเลือก direction ร่วมกัน

---

## 18. Roadmap recap + ที่จะทำต่อ

### Phase 1–10.3 = done (อ่าน `docs/roadmap.md` แบบเต็ม)

### Phase 10.4 — Evaluation Framework (next)
- A/B bucketing ผ่าน env / userId hash
- Holdout group ที่ไม่ถูก nudge เพื่อวัด causal lift
- CTR + conversion lift per surface
- Dashboard `/admin/experiments` (impressions, conversions, lift CI)
- Hook ใน `forYou2` + `proactive` + `recommendation-strip`

### Phase 11 — UX/UI Redesign (🟡 in progress)

**11.1 Foundation + Customer shell — 🟢 done (2026-05-22)**
- Design tokens 2-mode (light/dark) ผ่าน CSS custom properties + Tailwind dark:class
- `ThemeProvider` + `ThemeToggle` + no-flash inline script
- `CustomerShell` ที่แยก desktop / mobile chrome อย่างชัดเจน:
  - **Mobile (<lg)**: glass sticky header (logo + search + bell + theme) + bottom-tab 5 ปุ่ม (Home/Local/Cart/Orders/ฉัน)
  - **Desktop (≥lg)**: top bar 64px (logo + horizontal nav + search wide + bell + cart + profile + theme) + content max-w 1280px
- Landing `/` ตัดเป็น 2 layout: mobile (single-col CTA stack เหมือนเดิม refine) / desktop (12-col hero + floating product cards + 4-col feature grid + 2-col CTA)
- Feed `/feed`: mobile (chip row + bento 6-col + 2-col products) / desktop (sub-hero strip + bento 12-col + 5-col product grid + lg gap)
- New container utility `.container-app` (responsive 480 → 768 → 1280px)
- New semantic surface tokens (`bg-surface*`, `text-surface-*`, `border-surface*`) ที่ทำงานทั้ง light/dark

**11.2 ส่วนที่เหลือ (queue)**
- Apply shell pattern ให้ทุกหน้า customer (cart, checkout, PDP, search, orders, rewards, etc.) — ตอนนี้ inherit shell แต่ยังมี inline header เก่าใน บางหน้าซึ่งจะ refactor เป็น batch
- Merchant shell (left sidebar 240px on desktop, bottom-tab on mobile)
- Admin shell (desktop-first table primitive + filter bar)
- Creator + Rider shells
- Design system ย้ายไป `packages/ui` (extract tokens + AppShell + primitives)
- Storybook-equivalent component preview
- Accessibility audit pass บน customer flow

**Files changed (11.1)**
- `apps/web/tailwind.config.ts` (+ surface tokens, screens, heights, zIndex, max-w-app)
- `apps/web/src/app/globals.css` (+ light/dark CSS vars, container-app, scrollbar, glass adaptive)
- `apps/web/src/lib/theme.ts` (new — storage + no-flash script)
- `apps/web/src/components/theme-provider.tsx` (new)
- `apps/web/src/components/shell/customer-shell.tsx` (new)
- `apps/web/src/components/shell/customer-top-bar.tsx` (new, desktop)
- `apps/web/src/components/shell/customer-mobile-header.tsx` (new, mobile)
- `apps/web/src/components/shell/theme-toggle.tsx` (new)
- `apps/web/src/components/bottom-nav.tsx` (refresh: lg:hidden + new items + surface tokens)
- `apps/web/src/app/layout.tsx` (wire ThemeProvider + no-flash script)
- `apps/web/src/app/(customer)/layout.tsx` (use CustomerShell)
- `apps/web/src/app/page.tsx` (2-layout landing: mobile/desktop)
- `apps/web/src/app/(customer)/feed/page.tsx` (remove inline header + desktop multi-col)

### Phase 12 — TikTok-style Video Feed (🟢 done · 2026-05-23)

**Promoted `/feed` to a vertical short-video reel** as the new "home" of the customer persona, with the old commerce home relocated to `/feed/shop`.

- **`VideoFeed` primitive** (`apps/web/src/components/video/video-feed.tsx`) — reusable component
  - Vertical CSS scroll-snap (`snap-y snap-mandatory`), one clip per `100dvh`
  - `IntersectionObserver` per `<video>`: ≥60 % visible → play, else pause (single-clip playback)
  - Global mute toggle synced across all `<video>` refs
  - Infinite scroll via `useInfiniteQuery` (loads next cursor when active index ≥ `N-3`)
  - Deep-link `?v=<id>` → `scrollIntoView`
  - Right action rail: creator avatar + `+` follow badge, like (optimistic mutation w/ roll-back), comment placeholder (v2), bookmark (local-only), share (`navigator.share` → clipboard fallback), spinning music disc
  - Bottom caption: `@author`, shop chip, parsed hashtags from `tagsJson`, music ticker, product CTA pill (links to `/product/:id`)
  - Desktop layout: phone frame `max-w-[440px] aspect-[9/16]` centered + 320px side panel (creator, follow CTA, comments stub, stats)

- **Immersive shell** — `CustomerShell` checks `IMMERSIVE_ROUTES = new Set(['/feed'])` and:
  - Hides `CustomerMobileHeader`
  - Hides `ChatWidget` (would obscure the product CTA)
  - Drops `pb-24` from page wrapper
  - Passes `variant="overlay"` to `CustomerBottomNav` → translucent dark glass pill
  - New Tailwind `z-immersive: 30` so the nav (z-40) sits ABOVE the reel

- **Nav refresh**
  - **Mobile bottom nav** (5 tabs): ฟีด · ช้อป · ตะกร้า · ใกล้ฉัน · ฉัน
  - **Desktop top bar**: ฟีด · ช้อป · ใกล้ฉัน · คำสั่งซื้อ (removed "คลิป" since `/feed` IS the clips now)
  - `/feed/videos[?v=]` → 307 redirect to `/feed[?v=]` (back-compat for shared links)

- **Behavioural tracking**
  - `video_play` — fired once per clip the first time it becomes active
  - `video_complete` — `<video onEnded>`
  - `share` (with `meta.kind=like` or `meta.kind=share`)
  - `reco_click` on product CTA tap (`meta.from='video'` or `'video_desktop_panel'`)
  - `POST /v1/feed/:id/view` — server-side score bump

- **Backend seed** — `bootstrap-phase12.ts` inserts 8 Thai-captioned demo clips into `video_posts` using deterministic IDs `seed_v12_NN` + `INSERT OR IGNORE` (idempotent across every restart); attaches each to the first existing user / shop / product so `FeedService.feed()` JOINs return real names. Uses public Google sample mp4s + `picsum.photos` posters. Also dedups legacy random-id seeds from v1.

### Phase 12.1 — User Video Upload (🟢 done · 2026-05-23)

Closes the loop on Phase 12 by letting **any logged-in customer** post a clip to `/feed` from their phone camera in three taps — Storage layer (Phase 9.2) was extended to handle video MIME + 100 MB cap per upload.

- **Types** (`packages/types/src/storage.ts` + API mirror)
  - `storageUploadPurposeSchema` adds `'video'`; per-purpose `STORAGE_LIMITS` matrix (video 100 MB · video_thumb 2 MB · images 8 MB · shop_logo 4 MB)
  - `storageConfigSchema` exposes `limits` + `allowedByPurpose` so the FE can pre-validate before triggering an upload

- **StorageService**
  - `ALLOWED_BY_PURPOSE: Record<StorageUploadPurpose, string[]>` — video accepts `video/mp4|webm|quicktime`, video_thumb accepts the image set
  - Per-purpose size enforcement throws `BadRequestException` with a message that names the purpose
  - `extFromType()` extended for `.mp4` / `.webm` / `.mov`; validation runs in both real and mock driver modes

- **Client helpers** (`apps/web/src/lib/upload-video.ts` — kept separate from the image-compressing `upload.ts`)
  - `probeVideo()` reads `duration`/`videoWidth`/`videoHeight` via `<video preload=metadata>`
  - `extractVideoPoster()` renders a 720×1280 object-cover JPEG (@0.82) at frame 0.5 s
  - `uploadVideoFile()` uses XHR `upload.onprogress` (browser fetch streaming isn't reliable for upload progress) — no compression, surfaces 0..1 percentages to the UI, auto-confirms when the driver is mock
  - `uploadVideoPoster()` uses purpose `video_thumb`

- **Composer** `/feed/create`
  - Auth-gated (redirect `/login?next=%2Ffeed%2Fcreate`)
  - File picker `accept="video/mp4,video/webm,video/quicktime" capture="environment"` — on mobile this opens the back camera directly
  - Ordered client validation: size → MIME → `probeVideo` → duration ≤ 90 s
  - `<video controls>` preview using the probed aspect, with trash + "change clip" buttons
  - Caption textarea (≤ 500), chip-input tags (≤ 10, Enter / `,` / space pushes, Backspace pops), optional shop selector (auto-picks the merchant's first shop) + optional product CTA selector
  - Submit pipeline: poster → video upload (with progress bar) → poster upload → `api.feed.create` → `qc.invalidateQueries(['feed','videos'])` → `router.push('/feed?v=<new-id>')`

- **CreateFAB** (`apps/web/src/components/shell/create-fab.tsx`)
  - Mobile: floating circular "+" centred and lifted `env(safe-area-inset-bottom) + 5.5 rem` above the overlay bottom nav
  - Desktop: pill "สร้างคลิป" bottom-right
  - `href` flips based on `token` (logged-out → straight to login)
  - Rendered **only** on immersive routes — `CustomerShell` swaps `<ChatWidget>` ↔ `<CreateFAB>` (the chat would obscure the FAB and vice versa)

- **Env** — `.env.example` adds a Cloudflare R2 production checklist (endpoint / bucket / access keys / `S3_PUBLIC_BASE`), a CORS allow-list snippet (`AllowedMethods: ["GET","PUT","HEAD"]`), and the per-purpose limits table

- **Smoke** — `GET /v1/storage/config` returns the full limits matrix · `presign` rejects `image/jpeg` on `purpose=video` with 400 + Thai message · rejects 101 MB with 400 · `presign → POST /v1/feed` end-to-end persists a `vid_*` row with the Thai caption

**Future (queue)**: comments API + UI, follow/unfollow API, server-side personalised video ranking (extend taste profile or new endpoint), presigned video upload + transcoding, in-app save list, multi-stream prefetch.

### Phase 13 — Payment hardening
- Real Omise/2C2P/PromptPay confirm
- Refund pipeline ผ่าน gateway จริง (ไม่ใช่ manual)
- Subscription / recurring (ถ้าจำเป็น)

### Phase 14 — Native App
- Capacitor wire push (FCM/APNs token bootstrap)
- IPA + APK build pipeline
- Store submission

### Phase 15 — Scale
- ย้าย search → MeiliSearch / pg_trgm + pgvector
- Extract microservices (Payment, Logistics, Search)
- Multi-region

---

## 19. Risks & Open Questions

| Risk / Question | Impact | Mitigation / Status |
|---|---|---|
| PromptPay/Omise integration ยังเป็น mock | Trust + GMV blocked | Phase 12 ทำ + sandbox ก่อน |
| Search TF-IDF จำกัด catalog | Recall drop เมื่อสินค้าโตเกิน 10k SKU | ย้าย Meili/pgvector ใน Phase 14 |
| LLM rerank cost ไม่คาดเดาได้ | Cost blowout | timeout 4s + per-day budget cap + ENV-gated |
| Push delivery rate iOS PWA | iOS 16.4+ เท่านั้นรองรับ | ขึ้น Capacitor → APNs ใน Phase 13 |
| PDPA enforcement | Legal | Phase 14 audit pass; consent + retention ทำพื้นฐานแล้ว |
| Rider supply (Local) | Demand-side ไม่มี rider พอ | Fallback Grab/Lalamove dispatch (Phase 4.5) |
| Cold-start ranker | New user feed weak | Popularity fallback already in place + cohort onboarding (เป็น backlog) |
| Mobile build watcher EMFILE | Dev experience บน mac | ใช้ `WATCHPACK_POLLING=true` + ulimit (เพิ่ม script root แล้ว) |

### Open questions ที่ต้องตอบก่อน UX redesign

1. **Visual direction**: เน้น minimal/utility หรือคงไว้ playful (gradient/orb) แบบ landing?
2. **Brand palette refresh**: เก็บ brand current หรือเปลี่ยน?
3. **Bottom tab style**: pill-floating vs full-bar?
4. **PDP detail layout**: tabs in-content vs scroll-only?
5. **Merchant dashboard density**: card-heavy vs table-heavy?
6. **Dark mode**: launch v1 ต้องมี? (recommend Phase 11.5)
7. **Component lib**: keep shadcn/ui+Tailwind หรือสร้าง primitive ใหม่ทั้งหมด?
8. **String/i18n**: เริ่ม extract เป็น JSON message catalog เลยหรือยัง?

---

## 20. Acceptance Criteria (สำหรับเฟสที่กำลังจะทำ)

### Phase 11 — UX/UI Redesign (เสนอ)
- [ ] Design tokens เผยแพร่ใน `packages/ui/tokens.ts`
- [ ] AppShell + BottomTab primitive ใช้ได้บนทุก persona
- [ ] Customer 7 หน้าหลัก (feed/search/pdp/cart/checkout/orders/profile) ผ่าน mobile audit
- [ ] Merchant 6 หน้าหลัก ผ่าน density review
- [ ] Accessibility audit (axe) pass บน customer flow
- [ ] Snapshot/screenshot test ของ component primitive
- [ ] Storybook (หรือเทียบเท่า) เปิดดู component ได้

### Phase 10.4 — Evaluation (เสนอ)
- [ ] `experiments` table + assignment service (sticky per userId/anonId)
- [ ] env-flag เปิด/ปิด arm
- [ ] `RecommendationStrip` + `forYou2` + `Proactive sweepers` รับ `experimentArm`
- [ ] Dashboard `/admin/experiments` แสดง impressions, conversions, lift CI
- [ ] Holdout 5-10% globally + 50/50 per arm option
- [ ] Doc: ADR + กระบวนการ ship experiment

---

## 21. Glossary

| Term | Meaning |
|---|---|
| **Persona** | บทบาทของ user (Customer/Merchant/Creator/Rider/Admin) |
| **Shop** | ร้านค้าใน NP Commerce OS (online หรือ local) |
| **Local Store** | Shop ที่มี geo + slot + (อาจมี) rider — ร้านอาหาร/ตลาด/คาเฟ่ |
| **NP Protect** | Escrow + buyer protection layer |
| **NP Rider** | Carrier `EXPRESS_LOCAL` ที่ใช้ rider ของเราเอง |
| **Escrow** | เงินที่ถูกถือไว้จนลูกค้ายืนยันได้รับของ |
| **Dispute** | กรณีลูกค้าร้องเรียน (อาจ refund/escalate) |
| **Broadcast** | ข้อความที่ร้านส่งหา audience ผ่าน channel |
| **Audience / Segment** | ALL / BUYERS / ABANDONED_CART / VIP / RFM segments |
| **RFM** | Recency / Frequency / Monetary (segmentation) |
| **Taste Profile** | denormalised JSON snapshot ของรสนิยม user (shop/tag/price/recent) |
| **Reason Badge** | UI badge ที่อธิบายว่า recommendation มาจาก signal ไหน |
| **Nudge** | proactive push/email เพื่อกลับมา (browse-abandon, cart-abandon, win-back, price-drop, fav-shop-new) |
| **MMR diversity** | Maximal Marginal Relevance — cap items per shop เพื่อความหลากหลาย |
| **Firehose** | `user_events` table append-only ที่เก็บทุก interaction |
| **Consent** | สิทธิ์ในการ track พฤติกรรม (opt-out model) |
| **Cooldown** | เวลาขั้นต่ำที่ต้องรอก่อนส่ง nudge ชนิดเดิมซ้ำ |
| **Adapter pattern** | ทำให้ provider (push/email/storage/llm) เปลี่ยนเจ้าได้โดย swap class |
| **AI Ops** | `model_runs` table + `/admin/ai-ops` dashboard |

---

## 22. Appendix

- A — รายชื่อ Module เอกสารฉบับเต็ม: `docs/modules/01..13`
- B — ADR ที่เกี่ยวข้อง: `docs/decisions/0001-tech-stack.md`, `0002-dev-database-sqlite.md`
- C — Phase logs ละเอียด: `docs/roadmap.md`
- D — Deployment guide: `docs/structure-and-deploy.md`
- E — Mobile build: `docs/mobile-access.md`
- F — Phase 1 quickstart: `docs/phase-1-quickstart.md`

---

_Last updated: 2026-05-22 · maintainer: NP / @ii_
