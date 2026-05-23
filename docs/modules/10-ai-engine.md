# Module 10 — AI Engine

> ระบบ AI วิเคราะห์และแนะนำ ทั้งฝั่งลูกค้า ร้านค้า และ Admin

## โครงสร้าง
- **Inference Service** (Python FastAPI หรือ Node + ONNX)
- **Feature Store** (Redis + Postgres view)
- **Vector DB** (pgvector / Qdrant) สำหรับ recommendation/search
- **Model Registry** (เริ่มจาก local artifact, ขยับเป็น MLflow)

## สำหรับลูกค้า
- แนะนำสินค้า (collaborative + content-based + LLM rerank)
- แนะนำร้านใกล้ฉัน (geo + behavior)
- แนะนำโปร (segment-based)
- แนะนำซื้อซ้ำ (สินค้าใช้แล้วหมด เช่น ของกินของใช้)

## สำหรับร้านค้า
- วิเคราะห์ยอดขาย (trend, anomaly)
- แนะนำสินค้าเด่น (จาก feed engagement)
- แนะนำราคา (price elasticity)
- แนะนำโปรโมชัน (timing + segment)
- แนะนำ Creator (match style + audience)
- แจ้งเตือนยอดตก (week-over-week drop)

## สำหรับ Admin
- ตรวจร้านเสี่ยง (risk score → ML)
- ตรวจ Fraud (transaction anomaly, account linking)
- ตรวจรีวิวปลอม (text + behavior signal)
- ตรวจออเดอร์ผิดปกติ (velocity, geo mismatch)
- วิเคราะห์ขนส่งที่มีปัญหา (delay, claim rate)

## Data Pipeline
```
operational DB (Postgres) ──┐
event stream (Redis/Kafka) ─┤→ ETL → data warehouse (Postgres OLAP / DuckDB)
external (TikTok API, etc) ─┘             ↓
                                    feature store ─→ model training
                                          ↓
                                    inference API ─→ frontend / admin
```

## Models เริ่มต้น
| ใช้กับ | Model | หมายเหตุ |
|--------|-------|---------|
| recommendation | matrix factorization + content embed | baseline |
| search | bi-encoder + reranker | สำหรับ MeiliSearch ขั้นถัดไป |
| fraud | gradient boosting (rules + ML) | start with rules |
| review fake | LLM classifier + behavior signal | |
| price suggest | regression on competitor + history | |

## Dependency
- ทุก module (อ่าน event)
- Marketing Engine — ใช้ AI segment

## Acceptance (Phase 6)
- [ ] Recommendation CTR > baseline 30%
- [ ] Fraud catch rate > 90% (vs ground truth review)
- [ ] Price suggestion ลด stock-out < 50%
