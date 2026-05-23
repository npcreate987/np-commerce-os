# apps/api — NestJS

> Modular monolith API for NP Commerce OS

## เริ่ม Phase 1
```bash
# จาก root
pnpm dlx @nestjs/cli new api --strict --package-manager pnpm --skip-install
mv api/* apps/api/ && rmdir api
pnpm install
```

หรือสร้างเองให้ตรงกับ workspace:
```bash
mkdir -p apps/api/src
# ใส่ package.json, tsconfig.json, src/main.ts, src/app.module.ts
```

## Module Plan
```
src/modules/
├── auth/
├── customer/
├── merchant/
├── catalog/
├── creator/
├── cart/
├── checkout/
├── order/
├── payment/
├── escrow/
├── logistics/
├── local/
├── marketing/
├── trust/        # NP Protect
├── admin/
├── ai/
└── integration/
```

## Stack
- NestJS 10
- Fastify adapter
- Prisma (PostgreSQL)
- ioredis + BullMQ
- class-validator + zod
- Socket.IO (realtime)
- Swagger / Scalar (API docs)
