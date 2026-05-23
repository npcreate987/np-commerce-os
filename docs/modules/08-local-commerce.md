# Module 08 — NP Local Commerce

> ระบบร้านค้าท้องถิ่น: ร้านอาหาร คาเฟ่ ของฝาก ของสด ฯลฯ

## เป้าหมาย
- ร้านท้องถิ่นขายออนไลน์ได้โดยไม่ต้องพึ่งแพลตฟอร์ม Food Delivery เจ้าเดียว
- ลูกค้าหาร้านใกล้ตัว → สั่ง → รับเร็ว

## รองรับ
- ร้านอาหาร
- คาเฟ่
- ร้านของฝาก
- ร้านผลไม้
- ร้านของสด
- ตลาดสด
- ร้านค้าชุมชน
- ธุรกิจบริการในพื้นที่

## ฟีเจอร์หลัก
- ร้านใกล้ฉัน (geo search, รัศมีปรับได้)
- ส่งด่วนในพื้นที่ (15–60 นาที)
- ตั้งรัศมีการส่ง (per shop)
- นัดรับ / นัดส่ง (slot booking)
- เมนูอาหาร (variant, add-on, modifier)
- Rider Tracking (realtime map)
- Local Creator (creator ในพื้นที่)

## Data
- `local.store` (extends `merchant.shop`)
  - `geo: Point`
  - `delivery_radius_km`
  - `pickup_enabled`
  - `delivery_enabled`
- `local.menu` (เมนูอาหาร)
- `local.menu_item` (variant + modifier)
- `local.time_slot` (สำหรับนัด)
- `local.rider`
- `local.delivery_job`

## Flow ส่งด่วน
```
ลูกค้าค้น "ร้านใกล้ฉัน"
   ↓
เลือกร้าน → เลือกเมนู → checkout
   ↓
ร้านรับออเดอร์ → เตรียม
   ↓
ระบบ dispatch rider (ของเราเอง / Grab / Lalamove fallback)
   ↓
Rider tracking (lat/lng realtime)
   ↓
Delivered → confirmed
```

## Rider Dispatch Strategy
1. หา Local Rider ของแพลตฟอร์มที่ว่าง ≤ 3 กม. ก่อน
2. ไม่มี → ลอง Grab Express
3. ไม่มี → Lalamove
4. ไม่มี → ร้านส่งเอง (notify ร้าน)

## Dependency
- Merchant Platform (02)
- Smart Checkout (04)
- Logistics Hub (07)
- Marketing Engine (09) — "ร้านใกล้ฉัน" feed

## Acceptance (Phase 4)
- [ ] หาร้านในรัศมี 3 กม. < 1 วินาที
- [ ] Dispatch rider สำเร็จ ≥ 95%
- [ ] รับของภายใน 60 นาทีสำหรับเขตในเมือง
