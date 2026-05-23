# Module 03 — Creator / Affiliate Center

> ระบบสำหรับ Creator และนายหน้า: ให้ช่วยสร้างยอดให้ร้าน และระบบเราเก็บ data ครบ

## เป้าหมาย
- Creator สมัครและเริ่มขายได้ภายใน 5 นาที
- เลือกสินค้า → ได้ลิงก์ / QR ทันที
- เห็นยอด, ค่าคอม, ถอนเงินได้
- ป้องกัน fraud (self-referral, click farm)

## ฟีเจอร์หลัก
- สมัคร Creator (KYC เบา + เลข PromptPay)
- เลือกสินค้าไปโปรโมท (catalog filter, commission rate)
- รับลิงก์ / QR Code (deep link เปิด PWA + attribution cookie)
- Tracking ยอดขาย (click → add to cart → purchase → settled)
- คำนวณค่าคอม (rate by product / by shop / by tier)
- ดูรายงาน (รายวัน/รายเดือน)
- ถอนเงิน (auto payout เมื่อครบ threshold)

## หน้าจอ
- Creator Dashboard (earnings, top products, click)
- Catalog (browse + filter ที่เปิดให้ creator)
- My Links (list, copy, QR, performance)
- Commission (current rate, history)
- Payout (request, history)
- Settings (KYC, bank/PromptPay)

## Tracking Model
```
click → cookie (referral_id, ttl 30 days)
       → add_to_cart event
       → checkout event
       → purchase event
       → escrow_released → commission ready to payout
```

## Data
- `creator.profile`
- `creator.link`
- `creator.attribution_event`
- `creator.commission`
- `creator.payout`

## Dependency
- Merchant Platform (02) — ร้านเปิด commission
- Smart Checkout (04) — attribute referral ตอน checkout
- Payment / Escrow (05) — payout
- NP Protect (06) — anti-fraud

## Acceptance (Phase 3)
- [ ] Creator สร้างลิงก์ < 30 วินาที
- [ ] Click จากลิงก์ → ระบบ track ได้แม้ปิดแล้วเปิดใหม่ภายใน 30 วัน
- [ ] Commission คำนวณถูกต้องตามที่ตั้ง
- [ ] Fraud detection: self-purchase ถูก block
