# Module 12 — Data Layer

> ชั้นข้อมูล: OLTP, OLAP, search, cache, storage, event stream

## องค์ประกอบ

| ชั้น | เทคโนโลยี | เป้าหมาย |
|------|----------|---------|
| OLTP | **PostgreSQL 16** | transaction (order, payment, user) |
| Cache | **Redis** | session, hot cache, rate limit, BullMQ queue |
| Search | **MeiliSearch** | สินค้า, ร้าน, autocomplete |
| Vector | **pgvector** (ใน PG) | recommendation, semantic search |
| OLAP | **DuckDB / ClickHouse** (Phase 5+) | analytics, dashboard |
| Object Storage | **S3 / R2** | รูปสินค้า, วิดีโอ, KYC docs |
| Event Stream | **Redis Streams → Kafka** | event-driven |
| Log | **OpenSearch / Loki** | log aggregation |
| Metrics | **Prometheus + Grafana** | monitoring |

## Schema Conventions
- ชื่อ schema ตามโมดูล: `customer`, `merchant`, `catalog`, `payment`, `logistics`, `trust`, `marketing`, `creator`, `local`, `admin`
- `id` = UUIDv7 (sortable)
- ทุกตารางมี `created_at`, `updated_at`, `deleted_at` (soft delete)
- ทุกตารางมี `version` (optimistic lock) เมื่อจำเป็น
- เงิน = `numeric(14,2)` หรือเก็บเป็น cents `bigint`
- timezone = UTC

## Migration
- ใช้ **Prisma Migrate** หรือ **Drizzle** (เลือกใน ADR)
- ห้ามแก้ schema โดยไม่ทำ migration file
- migration ผ่าน CI ก่อน merge

## Event Schema (ตัวอย่าง)
```ts
type Event<T = unknown> = {
  id: string;            // ulid
  type: string;          // 'order.created' | 'payment.succeeded' | ...
  source: string;        // module name
  occurredAt: string;    // ISO
  data: T;
  meta: { traceId: string; userId?: string };
};
```

## Backup
- PG: daily snapshot + WAL streaming (PITR 7 วัน)
- S3: versioning + lifecycle
- Redis: RDB snapshot + AOF

## Privacy
- KYC documents เข้ารหัส at-rest (KMS)
- PII fields tagged → mask ในระบบ log
- รองรับ PDPA right-to-erasure (soft delete + anonymize)
