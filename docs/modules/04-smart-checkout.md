# Module 04 — Smart Checkout

> ปิดการขาย: ซื้อให้ง่ายที่สุด เร็วที่สุด ปลอดภัยที่สุด

## เป้าหมาย
- 1-page checkout
- เปิดบนมือถือใช้ได้ทันที (autofill, OTP, PromptPay QR)
- รองรับ guest checkout (ไม่บังคับสมัคร)

## ฟีเจอร์หลัก
- หน้าสินค้าแบบวิดีโอ (player + variant picker + sticky CTA)
- ตะกร้าสินค้า (cross-shop merging, แยก fee per shop)
- เลือกที่อยู่ (address book + autofill จาก GPS)
- เลือกขนส่ง (Logistics Hub แสดงตัวเลือก + ราคา)
- ใช้คูปอง (validate กับ Marketing Engine)
- ชำระเงิน (PromptPay QR, card, mobile banking, wallet)
- ยืนยันออเดอร์ (สถานะ + push notification)

## Checkout Flow (Step)
```
1. Cart (review items)
2. Address (or pick from saved)
3. Shipping (per shop, ลูกค้าเลือก)
4. Coupon (apply)
5. Payment (เลือกวิธี)
6. Confirm → API → 201 → Order Detail
```

> สามารถ collapse step ทั้งหมดในหน้าเดียวบน mobile (sticky bottom CTA)

## Data
- `cart.cart`, `cart.item`
- `checkout.session`
- `order.order`, `order.item`, `order.shipment`

## Edge cases ที่ต้องรองรับ
- สินค้าหมดสต็อกระหว่าง checkout
- ราคาเปลี่ยน (revalidate ก่อน confirm)
- คูปอง expire ระหว่าง checkout
- ขนส่งไม่รองรับพื้นที่ปลายทาง
- ลูกค้าปิด tab → resume checkout session ได้ภายใน 24 ชม.

## Dependency
- Catalog (Merchant 02)
- Payment / Escrow (05)
- Logistics Hub (07)
- Marketing Engine (09) — coupon
- Customer Platform (01) — address book

## Acceptance (Phase 1)
- [ ] Checkout จบใน 1 หน้า, < 4 tap บนมือถือ
- [ ] รองรับ guest (ใช้ OTP เบอร์โทรแทน password)
- [ ] PromptPay QR แสดงและ poll สถานะอัตโนมัติ
- [ ] Conversion rate (checkout → paid) > 60%
