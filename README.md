# NP Commerce OS

> ระบบ Commerce กลางสำหรับร้านค้าออนไลน์ ร้านค้าท้องถิ่น Creator และลูกค้า
> ใช้ TikTok / Social Media เป็นช่องดึงลูกค้า แต่ "ระบบเรา" เป็นเจ้าของการขาย เงิน ขนส่ง ดาต้า และการตลาดระยะยาว

[![status](https://img.shields.io/badge/status-spec--phase-blue)]()
[![stack](https://img.shields.io/badge/stack-Next.js%20%2B%20PWA%20%2B%20NestJS-black)]()
[![mobile](https://img.shields.io/badge/mobile-PWA%20ready-success)]()

---

## ทำไมต้อง NP Commerce OS

### ฝั่งร้านค้า
- ค่าธรรมเนียมแพลตฟอร์มสูง → เราเก็บถูกกว่า
- ไม่มี data ลูกค้า → เราคืน data ให้ร้าน
- Retarget ลูกค้าเก่ายาก → มี Marketing Engine
- ถูกผูกขาดขนส่ง → เลือกขนส่งเองได้

### ฝั่งลูกค้า
- กลัวโดนโกง → มี Escrow + NP Protect
- อยากเลือกขนส่งเอง → Logistics Hub
- อยากซื้อง่าย เร็ว ปลอดภัย → Smart Checkout

---

## โครงสร้างเอกสาร

| ไฟล์ | สำหรับ |
|------|--------|
| [`Agent.md`](./Agent.md) | **AI Agent ต้องอ่านก่อนทำงานทุกครั้ง** |
| [`docs/overview.md`](./docs/overview.md) | สเปกเต็มของโปรเจ็กต์ |
| [`docs/architecture.md`](./docs/architecture.md) | สถาปัตยกรรมระบบ |
| [`docs/roadmap.md`](./docs/roadmap.md) | Roadmap Phase 1–6 |
| [`docs/modules/`](./docs/modules/) | เอกสารราย module 13 ไฟล์ |
| [`docs/flows/`](./docs/flows/) | User flow / data flow |
| [`docs/decisions/`](./docs/decisions/) | ADR (Architecture Decision Records) |

---

## Tech Stack สั้น ๆ

- **Web (Customer + Merchant + Creator + Admin)**: Next.js 14 (App Router) + TypeScript + **PWA** + Tailwind + shadcn/ui
- **Mobile**: PWA (installable) → Capacitor (เมื่อจำเป็น)
- **API**: NestJS + PostgreSQL + Redis + MeiliSearch
- **Realtime**: Socket.IO
- **Auth**: Auth.js + JWT + OTP
- **Payment**: Omise / 2C2P / SCB Easy / TrueMoney
- **Logistics**: Shippop / Flash / Kerry / J&T / Grab / Lalamove
- **Monorepo**: Turborepo + pnpm workspaces

ดูเหตุผลและทางเลือกอื่น ๆ ที่ [`docs/decisions/0001-tech-stack.md`](./docs/decisions/0001-tech-stack.md)

---

## โครงสร้างโปรเจ็กต์

```
np-commerce-os/
├── Agent.md
├── README.md
├── apps/
│   ├── web/        ← Next.js + PWA (multi-tenant: customer/merchant/creator/admin)
│   └── api/        ← NestJS
├── packages/
│   ├── ui/         ← shared components
│   ├── types/      ← shared DTO/Zod
│   ├── sdk/        ← typed API client
│   └── config/     ← shared eslint/tsconfig
├── infra/
│   ├── docker/
│   ├── k8s/
│   └── terraform/
├── scripts/
└── docs/
```

---

## เริ่มต้นใช้งาน (เมื่อ Phase 1 พร้อม)

> ขณะนี้โปรเจ็กต์อยู่ใน **spec phase** — โครงโฟลเดอร์ + เอกสารพร้อมแล้ว ยังไม่ลงโค้ดจริง
> เมื่อเริ่ม Phase 1 จะใช้คำสั่งเหล่านี้

### 1. ติดตั้ง dependency
```bash
# ต้องมี Node.js >= 20 และ pnpm >= 9
corepack enable
pnpm install
```

### 2. ตั้งค่า env
```bash
cp .env.example .env
# แก้ค่า DATABASE_URL, REDIS_URL, JWT_SECRET, ฯลฯ
```

### 3. รัน dev
```bash
pnpm dev           # รันทั้ง web + api
pnpm dev:web       # เฉพาะ Next.js
pnpm dev:api       # เฉพาะ NestJS
```

### 4. Build production
```bash
pnpm build         # build ทุก package
pnpm build:web     # build PWA
```

### 5. Build ลงมือถือ (PWA — ใช้ได้ทันทีไม่ต้อง build native)
- เปิด `https://your-domain` บนมือถือ
- Chrome (Android): กด ⋮ → "Install app" หรือ "Add to Home Screen"
- Safari (iOS): กด Share → "Add to Home Screen"
- ลูกค้าจะมี icon บนหน้าจอเหมือนแอปจริง

### 6. Build native APK/IPA (Phase 15 ✅ พร้อมแล้ว)

```bash
cd apps/web
BUILD_STATIC=true pnpm build && pnpm cap:sync
pnpm cap:open:ios        # → Xcode (Cmd-R เปิด simulator)
pnpm cap:open:android    # → Android Studio (Run)
```

อัปเดต logo / splash:
```bash
# แทน apps/web/resources/{logo,splash}.svg แล้วรัน:
pnpm assets:build         # render + generate 100+ resolutions
pnpm cap:sync             # copy เข้า ios/android projects
```

ดูคู่มือเต็ม (live reload, store submission, troubleshooting):
[`docs/phase-15-mobile.md`](./docs/phase-15-mobile.md) ·
[`docs/mobile-access.md`](./docs/mobile-access.md)

---

## Phase ปัจจุบัน

🔵 **Phase 0 — Spec & Scaffold** (กำลังทำ)
- [x] วางโครงโฟลเดอร์
- [x] เขียน `Agent.md`
- [x] เขียน `README.md`
- [ ] เขียนเอกสารราย module ครบ 13 ไฟล์
- [ ] วาง `package.json` / `turbo.json` / `pnpm-workspace.yaml`
- [ ] วาง `.env.example` / `.gitignore` / `.editorconfig`

ถัดไป: **Phase 1 — Core Commerce MVP**

---

## License

Proprietary © NP — All rights reserved.
