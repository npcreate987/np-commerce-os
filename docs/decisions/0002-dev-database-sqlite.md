# ADR-0002 — ใช้ SQLite สำหรับ dev / Postgres สำหรับ prod

- **สถานะ**: Accepted
- **วันที่**: 2026-05-21
- **ผู้ตัดสินใจ**: NP / @ii

## บริบท

เครื่องผู้ใช้ตอน bootstrap ไม่มี Docker / Homebrew ติดตั้ง
เพื่อให้ "ขึ้น local ได้ทันทีโดยไม่ต้องติดตั้งอะไรเพิ่ม" Phase 1 จึงต้องเลือก DB
ที่ทำงานได้ใน Node process ตรง ๆ

## ทางเลือก

- **A. SQLite via Prisma** — Built-in, zero install, ใช้ไฟล์ `.db`
- **B. PGlite (Wasm Postgres)** — ตรงกว่า prod แต่ Prisma support ยังไม่นิ่ง
- **C. Embedded Postgres** — npm package + binary; ใช้ disk เพิ่ม ~100MB
- **D. รอ user ติดตั้ง Docker** — block งาน

## การตัดสินใจ

เลือก **Option A — SQLite via Prisma** สำหรับ dev local
และคง Postgres เป็น target ของ prod (ตาม ADR-0001)

## ผลที่ตามมา

### บวก
- ขึ้น local ได้ทันที (`pnpm install && pnpm prisma:migrate && pnpm dev`)
- ไม่ต้องใช้ Docker / Homebrew / postgres binary
- ไฟล์ `dev.db` คอมมิตไม่ได้ (อยู่ใน `.gitignore`) ทำให้ทุกคนเริ่มจากศูนย์

### ลบ (และ mitigation)
1. **SQLite ใน Prisma ไม่รองรับ `enum`** → ใช้ `String` พร้อม comment กำกับค่าที่ allowed, validate ด้วย Zod ใน `@np/types`
2. **ไม่มี `Json` type** → field `shippingAddress` เก็บเป็น `String` (JSON-stringified) ใน column `shippingAddressJson`
3. **ไม่มี `Uuid` type** → ใช้ `cuid()` แทน (sortable, URL-safe)
4. **Concurrency แตกต่างจาก Postgres** → ตอน prod ต้องทดสอบ transaction/locking ใหม่
5. **ไม่มี full-text / pg_trgm** → search Phase 2 จะใช้ MeiliSearch อยู่แล้ว ไม่กระทบ

## Migration ตอนย้ายไป Postgres

1. เปลี่ยน `datasource db.provider = "postgresql"` ใน `schema.prisma`
2. ตั้ง `DATABASE_URL` ใหม่
3. รัน `pnpm prisma migrate dev --name init_postgres` เพื่อสร้าง migration ใหม่
4. **(ไม่บังคับ)** เปลี่ยน `status/role/method` → Prisma enum ผ่าน migration custom ถ้าต้องการ type safety เพิ่ม
5. เปลี่ยน `shippingAddressJson` → `Json` field พร้อม migration data transformation
6. ทดสอบ e2e flow

## ทบทวน

ทบทวนอีกครั้งเมื่อ:
- เริ่ม Phase 2 (Escrow + Logistics) — ต้องการ Postgres advisory lock
- มีผู้ใช้ > 100 (production traffic จริง)
- ทีมมีคนเพิ่ม → standardize dev env ด้วย Docker
