# Module 06 — NP Protect

> ระบบความปลอดภัย: ทำให้ลูกค้ากล้าซื้อ ร้านดีมีเครดิต ร้านโกงโดน block

## เป้าหมาย
- ลด fraud rate ของแพลตฟอร์ม
- เพิ่มความเชื่อถือร้านที่ผ่านการตรวจ
- จัดการ dispute เป็นระบบ

## ฟีเจอร์หลัก
- **ยืนยันตัวตนร้านค้า** (KYC): บัตรประชาชน + selfie + เอกสารธุรกิจ
- **ตรวจบัญชีธนาคาร** (name match กับ KYC)
- **ตรวจสินค้าเสี่ยง** (keyword + image classifier)
- **Risk Score ร้านค้า** (ปรับ realtime จาก behavior)
- **Buyer Protection** (เงื่อนไขคืนเงิน)
- **ระบบเคลม / คืนเงิน** (dispute workflow)
- **ตรวจออเดอร์ผิดปกติ** (rule + ML)
- **Blacklist** (ร้าน / บัญชี / เบอร์ / device fingerprint / IP)

## Risk Score (ตัวอย่าง 0–100)
- เริ่มต้นร้านใหม่ = 50
- KYC ครบ + บัญชีตรง = +20
- ส่งทันเวลา 95%+ = +10
- รีวิว 4.5+ ดาว = +10
- มี dispute = -10 ต่อเคส
- chargeback = -30

> Score < 30 → freeze payout จนตรวจ
> Score < 10 → ระงับร้านอัตโนมัติ

## Dispute Workflow
```
ลูกค้าแจ้งปัญหา
   ↓
ระบบเก็บหลักฐาน (ออเดอร์, แชต, รูป)
   ↓
ติดต่อร้านให้ตอบใน 48 ชม.
   ↓
ตกลงกัน → จบ
ไม่ตก → Admin / ML ตัดสิน
   ↓
ผลลัพธ์ (refund full / partial / reject)
```

## Data
- `trust.kyc`
- `trust.risk_score` (snapshot + history)
- `trust.dispute`
- `trust.blacklist`
- `trust.evidence`

## Dependency
- Payment (05) — freeze payout
- Logistics (07) — delivered evidence
- AI Engine (10) — fraud model
- Admin (11) — manual review

## Acceptance (Phase 2)
- [ ] KYC อนุมัติ < 1 ชม. (auto + manual)
- [ ] Dispute เปิด → ปิด ≤ 7 วัน
- [ ] Fraud rate < 0.5% ของ GMV
