# Phase 1 — Quickstart

ครบเครื่องสำหรับเริ่มรันโปรเจ็กต์ Phase 1 ทันที

## สิ่งที่ต้องมี

- **Node.js >= 20** (มี `.nvmrc` ที่ root)
- **pnpm >= 9** (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker Desktop** (สำหรับ Postgres + Redis + MeiliSearch + MinIO local)

## ติดตั้ง

```bash
cd /Users/ii/Documents/np-commerce-os

# 1) ติดตั้ง dependency ทั้ง monorepo
corepack enable
pnpm install

# 2) เปิดบริการพื้นฐาน (postgres, redis, meili, minio)
docker compose -f infra/docker/docker-compose.dev.yml up -d

# 3) ตั้งค่า env
cp .env.example .env
# โครงสร้าง .env ใช้ได้เลยตามค่า default ของ docker-compose

# 4) Generate Prisma client + migrate + seed
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate -- --name init
pnpm seed
cd ../..

# 5) รัน dev ทั้ง stack
pnpm dev
```

หลังจากนี้:
- **Web** → http://localhost:3000
- **API** → http://localhost:3001/v1/health
- **Prisma Studio** → `cd apps/api && pnpm prisma:studio`

## บัญชี seed

| Role | Email | Password |
|------|-------|----------|
| Customer | `user@np.dev` | `password123` |
| Merchant | `shop@np.dev` | `password123` |

ร้านตัวอย่าง: `np-demo-shop` (มี 3 สินค้า)

## ทดสอบ flow ครบ (E2E)

1. เปิด http://localhost:3000 บน Chrome มือถือ (หรือ DevTools Device Mode)
2. กด **เริ่มช้อปปิ้ง** → ดู feed
3. กดสินค้า → กด **เพิ่มไปยังตะกร้า** (ระบบจะให้ login → ใช้ `user@np.dev`)
4. ไปตะกร้า → ปรับจำนวน → กด **ไปชำระเงิน**
5. กรอกที่อยู่ → กด **ชำระเงิน** (สร้าง order + payment record)
6. ไป **คำสั่งซื้อ** → กด **จำลองการชำระเงิน (mock)** → order เปลี่ยนเป็น `PAID`
7. Logout แล้ว login ใหม่เป็น `shop@np.dev` → ไป **/orders** ในเมนู merchant
8. กด **ทำเครื่องหมายว่าจัดส่งแล้ว** → status เปลี่ยนเป็น `SHIPPED`

## PWA — Install เป็นแอปบนมือถือ

> หมายเหตุ: PWA จะถูก disable ใน dev mode (ดู `next.config.mjs`)
> ต้อง build production แล้ว start ถึงจะได้ service worker จริง

```bash
pnpm build:web
pnpm --filter web start
```

แล้วเปิดบนมือถือ (ใช้ Cloudflare Tunnel / ngrok / IP ของเครื่องในวง WiFi เดียวกัน):
- **Android Chrome** → ⋮ → "Install app" / "Add to Home screen"
- **iOS Safari** → Share → "Add to Home Screen"

จะได้ icon "NP" บนหน้า Home เหมือนแอปจริง

## โครงสร้าง API ทั้งหมด (Phase 1)

ทั้งหมดอยู่ใต้ `/v1` prefix

### Auth (public)
- `POST /auth/signup` → `{ email, password, name?, role? }`
- `POST /auth/login` → `{ email, password }`
- `GET /auth/me` (JWT)

### Users
- `GET /users/me` (JWT)

### Shops
- `POST /shops` (JWT) — เปิดร้าน
- `GET /shops/mine/list` (JWT)
- `GET /shops/:slug` (public)

### Products
- `GET /products?limit=&cursor=` (public, status=ACTIVE)
- `GET /products/:id` (public)
- `GET /products/shop/:shopId/list` (JWT)
- `POST /products/shop/:shopId` (JWT, owner only)
- `PATCH /products/:id` (JWT, owner only)

### Cart (JWT)
- `GET /cart`
- `POST /cart/items` → `{ productId, quantity }`
- `PATCH /cart/items/:id` → `{ quantity }`
- `DELETE /cart`

### Checkout (JWT)
- `POST /checkout` → `{ shippingAddress }`

### Orders (JWT)
- `GET /orders/mine`
- `GET /orders/shop/:shopId` (owner only)
- `GET /orders/:id`
- `POST /orders/:id/ship` (owner only)

### Payments (JWT)
- `POST /payments` → `{ orderId, method }`
- `POST /payments/mock/confirm/:orderId` ← **mock** สำหรับ dev เท่านั้น

## Acceptance Phase 1 (ตาม roadmap)

- [x] monorepo build ได้ผ่าน (`pnpm install` + `pnpm typecheck`)
- [ ] web ขึ้น Vercel ได้ (ต้องตั้ง `NEXT_PUBLIC_API_URL` ใน prod env)
- [ ] api ขึ้น Railway/Fly ได้ (Dockerfile จะใส่ใน Phase 1.5)
- [x] database migration ทำงาน (`prisma migrate dev`)
- [x] e2e: signup → list product → buy → confirm payment → see order

## ขั้นต่อไป

1. ทำ Dockerfile production สำหรับ web + api
2. ใส่ pg_trgm + MeiliSearch indexing สำหรับ search
3. ต่อ Omise/PromptPay จริง (แทน mock confirm)
4. สร้าง icons PWA จริง (จาก logo)
5. ใส่ rate limiting + helmet ฝั่ง api
6. ขยับเข้าสู่ Phase 2 — Escrow + Logistics
