# ADR-0001 — เลือก Tech Stack หลัก

- **สถานะ**: Accepted
- **วันที่**: 2026-05-21
- **ผู้ตัดสินใจ**: NP / @ii
- **ผู้เขียน**: NP Commerce OS Agent

## บริบท (Context)

NP Commerce OS ต้อง:
1. **Build บน "โทรศัพท์" ได้** (mobile-first)
2. **มีหลาย persona**: customer, merchant, creator, admin
3. **เป็นทีมเล็ก** (1-3 dev ในช่วงแรก) → ต้องใช้ stack ที่ share โค้ดได้สูงสุด
4. **ขยายได้** จาก MVP → ระบบเต็มที่มี AI, escrow, logistics, marketing

## ทางเลือก (Options)

### Option A — Next.js + PWA + NestJS (เลือก)
- **+** Codebase เดียวรองรับ web + mobile (PWA installable)
- **+** TypeScript ทั้งระบบ → share types ได้
- **+** Next.js App Router มี SSR/ISR/Edge → ดี SEO และ performance
- **+** NestJS มีโครงสร้างชัด, DI, modular monolith เริ่มง่าย
- **+** ถ้าต้องการ native APIs ในอนาคต ห่อด้วย **Capacitor** ได้ทันที (APK/IPA)
- **−** PWA ของ iOS ยังไม่สมบูรณ์เท่า Android (push เพิ่งรองรับใน iOS 16.4+)
- **−** ต้องใส่ใจ service worker / cache strategy ให้ดี

### Option B — Expo + React Native + NestJS
- **+** Native UI feel
- **+** Codebase เดียว iOS/Android/Web (Expo Web)
- **−** Build process หนัก, ต้องมี EAS Build
- **−** Web ไม่ดีเท่า Next.js เรื่อง SEO
- **−** ทีมเล็กต้องเรียนรู้ทั้ง RN + Next.js ฝั่ง marketing/admin

### Option C — Flutter + NestJS
- **+** UI ดีและสม่ำเสมอ
- **−** Dart ต่างจาก TS — แยก ecosystem
- **−** ใช้ทำ admin/marketing site ยาก
- **−** ทีมต้องเก่ง Dart

### Option D — React Native bare + Custom Backend
- **−** Setup ซับซ้อน เกินจำเป็นสำหรับ MVP

## การตัดสินใจ (Decision)

เลือก **Option A — Next.js 14 (App Router) + PWA + NestJS** ด้วยเหตุผล:

1. **mobile-first + installable** ผ่าน PWA ได้ทันทีโดยไม่ต้อง app store
2. **โค้ดเดียวรองรับทุก persona** ผ่าน route group ใน App Router
3. **share types/zod** ผ่าน packages/types ระหว่าง web และ api
4. **เริ่มเล็ก ขยายใหญ่ได้**: monorepo (Turborepo + pnpm) → microservices ทีหลัง
5. **ถ้าต้อง native** ห่อด้วย Capacitor ได้โดยใช้โค้ดเดิม

## ผลที่ตามมา (Consequences)

### บวก
- Time-to-MVP สั้น
- Hiring ง่าย (TS ecosystem)
- ออก native APK/IPA ได้เมื่อจำเป็น

### ลบ
- ต้อง maintain service worker / PWA manifest อย่างจริงจัง
- ต้องวาง strategy เรื่อง offline / sync ตั้งแต่ Phase 1
- ใช้ Capacitor ห่อในอนาคต = ต้องระวัง browser-only API (กล้อง, BLE) ไม่ทำงานในเว็บ → ใส่ feature detection

## รายละเอียดต่อท้าย

### Package เริ่มต้น (จะใส่ใน `package.json` ตอน Phase 0/1)
- web: `next`, `react`, `typescript`, `tailwindcss`, `@ducanh2912/next-pwa`, `zustand`, `@tanstack/react-query`, `zod`
- api: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify`, `prisma`, `pg`, `ioredis`, `bullmq`, `class-validator`, `zod`
- shared: `turbo`, `eslint`, `prettier`, `vitest`, `playwright`

### Hosting เริ่มต้น
- web → Vercel
- api → Railway / Fly.io
- DB → Neon (PG) + Upstash (Redis)
- Object → Cloudflare R2

> ทบทวน ADR นี้อีกครั้งเมื่อ: end of Phase 2, มีผู้ใช้ > 50k MAU, หรือมี requirement native ที่ PWA ทำไม่ได้
