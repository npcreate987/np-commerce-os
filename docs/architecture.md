# Architecture — NP Commerce OS

## 1. ภาพรวม (High-Level)

```
┌──────────────────────────────────────────────────────────────────┐
│                       NP Commerce OS                              │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Customer   │  │ Merchant   │  │ Creator    │  │ Admin      │ │
│  │ PWA App    │  │ Dashboard  │  │ Center     │  │ Console    │ │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘ │
│        │               │               │               │        │
│        └───────────────┴───────┬───────┴───────────────┘        │
│                                │                                 │
│                       ┌────────▼────────┐                        │
│                       │   API Gateway   │ (Next.js Route + BFF) │
│                       └────────┬────────┘                        │
│                                │                                 │
│        ┌───────────────────────┼───────────────────────┐         │
│        │                       │                       │         │
│  ┌─────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐ │
│  │ Commerce   │         │ Payment     │         │ Logistics   │ │
│  │ Service    │         │ /Escrow     │         │ Hub Service │ │
│  └─────┬──────┘         └──────┬──────┘         └──────┬──────┘ │
│        │                       │                       │         │
│  ┌─────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐ │
│  │ NP Protect │         │ Marketing   │         │ AI Engine   │ │
│  │ Service    │         │ Engine      │         │ Service     │ │
│  └────────────┘         └─────────────┘         └─────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Data Layer: PostgreSQL · Redis · MeiliSearch · S3       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Integration: Payment GW · Logistics API · TikTok API ·   │   │
│  │  LINE OA · FCM/APNs · Email · SMS                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. แนวทาง (Architecture Style)

- **Modular Monolith → Microservices ในอนาคต**
  - เริ่มจาก NestJS 1 แอป แต่แบ่ง module ตามขอบเขต (Bounded Context)
  - เมื่อโมดูลใดต้อง scale แยกค่อย extract เป็น service ต่างหาก
- **Frontend = Next.js (App Router) ตัวเดียวรองรับทุก persona**
  - แยก route group: `(customer)`, `(merchant)`, `(creator)`, `(admin)`
  - ใช้ middleware เช็ค role + redirect
- **API Surface**: REST (หลัก) + WebSocket (realtime) + GraphQL (เลือกใช้สำหรับ dashboard ที่ซับซ้อน)
- **Data**: PostgreSQL (ACID), Redis (cache/queue/session), MeiliSearch (search สินค้า/ร้าน), S3 (รูป/วิดีโอ)
- **Event-driven** สำหรับ async: ใช้ Redis Streams / BullMQ ก่อน, ย้าย Kafka เมื่อ scale

---

## 3. การแบ่งโมดูล (Domain / Bounded Contexts)

| โมดูล | ขอบเขต | DB schema |
|------|---------|-----------|
| Customer Platform | feed, profile, address, wishlist | `customer.*` |
| Merchant Platform | shop, product, order mgmt | `merchant.*`, `catalog.*` |
| Creator Center | creator, link, commission | `creator.*` |
| Smart Checkout | cart, checkout session | `cart.*`, `checkout.*` |
| Payment / Escrow | payment, escrow ledger, payout | `payment.*` |
| NP Protect | KYC, risk score, dispute | `trust.*` |
| Logistics Hub | shipment, tracking, label | `logistics.*` |
| Local Commerce | store geo, rider, delivery zone | `local.*` |
| Marketing Engine | coupon, loyalty, broadcast | `marketing.*` |
| AI Engine | recommendation, fraud, analytics | (read-only views + ML store) |
| Admin Platform | RBAC, audit log, ops console | `admin.*` |
| Data Layer | shared schemas, OLAP exports | — |
| Integration Layer | external adapters | — |

---

## 4. Persona & Route Map (Frontend)

```
apps/web/src/app/
├── (marketing)/         ← landing, about
├── (customer)/
│   ├── feed/            ← short video feed
│   ├── search/
│   ├── product/[id]/
│   ├── store/[slug]/
│   ├── cart/
│   ├── checkout/
│   ├── orders/
│   └── profile/
├── (merchant)/
│   ├── dashboard/
│   ├── products/
│   ├── orders/
│   ├── shipping/
│   ├── promo/
│   ├── customers/
│   └── settings/
├── (creator)/
│   ├── dashboard/
│   ├── catalog/
│   ├── links/
│   ├── commission/
│   └── payouts/
├── (admin)/
│   ├── overview/
│   ├── merchants/
│   ├── disputes/
│   ├── fraud/
│   └── logistics/
└── api/                 ← BFF endpoints (เรียก NestJS)
```

---

## 5. PWA Architecture (Mobile-first)

- `public/manifest.json` — ชื่อแอป, icon ทุกขนาด (192/512/maskable), theme color, start_url
- Service worker via `next-pwa`:
  - **Cache-First**: image, font
  - **Network-First**: API call (with fallback ไป cache)
  - **Stale-While-Revalidate**: หน้า home, product list
- Offline shell: หน้า home, cart, last orders เปิดได้ตอน offline
- Push: Web Push (VAPID) + FCM (เมื่อห่อ Capacitor)
- Add to Home Screen prompt ที่จัดการเอง (custom UI)

---

## 6. Data Flow ตัวอย่าง: ซื้อของผ่าน TikTok

1. ลูกค้ากดลิงก์จากคลิป TikTok → เปิด `https://shop.np/<creator-id>/product/<id>`
2. Next.js render หน้าสินค้า (ISR) + track creator referral cookie
3. ลูกค้ากด "ซื้อเลย" → checkout session ถูกสร้างที่ `api/checkout`
4. เลือกที่อยู่ + ขนส่ง → Logistics Hub คำนวณค่าส่ง
5. ชำระเงิน → Payment Service เรียก Omise → status `pending_escrow`
6. ระบบสร้าง shipment + label → ร้านปะส่ง
7. ขนส่งอัปเดต tracking → ลูกค้าเห็นใน orders
8. ลูกค้ายืนยันรับของ → Escrow ปล่อยเงินให้ร้าน
9. CRM ทริก: ส่งคูปองซื้อซ้ำ + ขอรีวิว

---

## 7. Non-Functional Requirements

| ด้าน | เป้าหมาย |
|------|---------|
| Performance | LCP < 2.5s (mobile 4G), TTI < 3.5s |
| Availability | 99.9% (Phase 2+) |
| Security | OWASP Top 10, PDPA-ready, secrets in vault |
| Scalability | 10k concurrent users (Phase 3), 100k (Phase 5) |
| Accessibility | WCAG 2.1 AA |
| i18n | TH (หลัก) + EN (อนาคต) |

---

## 8. การ Deploy เริ่มต้น (Phase 1)

- **web**: Vercel (Edge runtime สำหรับ middleware)
- **api**: Railway / Fly.io (Docker)
- **postgres**: Neon / Supabase
- **redis**: Upstash
- **storage**: Cloudflare R2
- **search**: MeiliSearch Cloud (หรือ self-host บน Fly.io)
- **DNS/CDN**: Cloudflare

เมื่อ scale: ย้ายไป Kubernetes (GKE/EKS) + Terraform จาก `infra/`
