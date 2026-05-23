# Module 02 — Merchant Platform

> ระบบฝั่งร้านค้า: ให้ขายง่าย เก็บ data ลูกค้าได้ ลดการพึ่งแพลตฟอร์มใหญ่

## เป้าหมาย
- สมัครและเริ่มขายได้ภายใน 1 วัน
- จัดการออเดอร์/ขนส่งในหน้าเดียว
- เห็นยอดขาย / ลูกค้า / กำไรชัดเจน
- ทำการตลาดซ้ำได้เอง (coupon, broadcast)

## ฟีเจอร์หลัก
- สมัครร้านค้า + ยืนยันตัวตน (KYC)
- ลงสินค้า / เมนูอาหาร (รูป, วิดีโอสั้น, variant, สต็อก)
- จัดการออเดอร์ (รับ → เตรียม → ส่ง → ปิด)
- จัดการขนส่ง (เลือกเจ้า, พิมพ์ใบปะหน้า, เรียกรถ)
- ดูยอดขาย (กราฟ, รายงาน, export)
- ดูลูกค้า (CRM list, segment)
- ทำคูปอง / โปรโมชัน
- เชื่อม Creator (อนุญาตให้ creator นำสินค้าไปขาย)
- ดูเงินรอปล่อย (escrow balance, payout history)

## หน้าจอ
- Dashboard (KPI)
- Products / Add Product / Bulk Import
- Orders / Order Detail / Shipping
- Promotions / Coupons
- Customers (segment, broadcast)
- Creators (offers, commission rate)
- Finance (escrow, payout, fees)
- Settings (shop info, bank, KYC)

## Data
- `merchant.shop`
- `merchant.staff` (role)
- `catalog.product`, `catalog.variant`, `catalog.media`
- `merchant.payout_account`
- `merchant.kyc_document`

## Dependency
- NP Protect (06) — KYC, risk score
- Payment / Escrow (05)
- Logistics Hub (07)
- Creator Center (03)
- Marketing Engine (09)

## Acceptance (Phase 1)
- [ ] สมัคร → KYC → ลงสินค้าแรก ภายใน 15 นาที
- [ ] รับออเดอร์ → กดส่ง → ระบบสร้าง label อัตโนมัติ
- [ ] ดู dashboard ยอดขายวัน/เดือน
