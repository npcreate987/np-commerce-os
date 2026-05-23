# Module 01 — Customer Platform

> ระบบฝั่งลูกค้า: ทำให้ลูกค้าอยากเข้ามาใช้ซ้ำ ไม่ใช่แค่ตอนจ่ายเงิน

## เป้าหมาย
- เปิดแอป (PWA) แล้วเจอของน่าซื้อทันที
- ซื้อง่าย ติดตามได้ มั่นใจ
- กลับมาใช้ซ้ำเพราะมีคูปอง / แต้ม / ของใกล้ตัว

## ฟีเจอร์หลัก
- หน้า **Feed วิดีโอสินค้า** (TikTok-like, infinite scroll)
- สินค้าแนะนำ (personalized)
- โปรใกล้ฉัน (geo)
- ร้านอาหารใกล้ฉัน (geo + Local Commerce)
- Flash Deal (countdown)
- คูปอง (ของฉัน / ใช้ได้)
- แต้มสะสม (loyalty)
- ติดตามคำสั่งซื้อ (multi-courier tracking)
- แจ้งปัญหา / ขอคืนเงิน (dispute UI)

## หน้าจอ (mobile-first)
- Feed
- Search
- Product Detail
- Store Detail
- Cart
- Checkout
- Orders & Tracking
- Coupons
- Points
- Profile / Address Book / Payment Methods
- Notifications
- Support / Dispute

## Data ที่เกี่ยวข้อง
- `customer.profile`
- `customer.address`
- `customer.payment_method`
- `customer.wishlist`
- `customer.behavior_event` (สำหรับ AI Engine)

## Dependency
- Smart Checkout (04)
- Marketing Engine (09) — coupon/loyalty
- Logistics Hub (07) — tracking
- AI Engine (10) — recommendation

## Acceptance (Phase 1)
- [ ] เปิด PWA → feed โหลด < 2.5s บน 4G
- [ ] กดซื้อ → เข้า checkout < 1 click
- [ ] ติดตั้งเป็นแอปบนมือถือได้ (Add to Home Screen)
- [ ] เปิด offline เห็นออเดอร์ล่าสุด + ตะกร้า
