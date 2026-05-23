# Module 07 — NP Logistics Hub

> ระบบขนส่งกลาง ไม่ผูกขาด

## เป้าหมาย
- ร้านและลูกค้าเลือกขนส่งได้เอง
- พิมพ์ใบปะหน้า เรียกรถ tracking ในที่เดียว

## ฟีเจอร์หลัก
- เชื่อมขนส่งหลายเจ้า (adapter pattern)
- ลูกค้าเลือกขนส่งเอง (ต่อ shipment)
- คำนวณค่าส่ง (น้ำหนัก + COD + ปลายทาง)
- พิมพ์ใบปะหน้า (PDF / Zebra)
- เรียกรถเข้ารับ (pickup booking)
- Tracking รวมทุกเจ้า (webhook + polling fallback)
- เคลมขนส่ง (ของเสียหาย, หาย)

## ประเภทขนส่ง
### พัสดุทั่วไป
- Flash Express
- Kerry Express
- J&T Express
- ไปรษณีย์ไทย (EMS / ลงทะเบียน)
- DHL (international)

### ส่งด่วนท้องถิ่น (Local Commerce)
- Grab Express
- Lalamove
- Rider Local (พาร์ทเนอร์เรา)
- ร้านส่งเอง

## Adapter Pattern
```
apps/api/src/modules/logistics/
├── logistics.service.ts
├── providers/
│   ├── flash.provider.ts
│   ├── kerry.provider.ts
│   ├── jt.provider.ts
│   ├── thailand-post.provider.ts
│   ├── grab.provider.ts
│   ├── lalamove.provider.ts
│   └── shippop.aggregator.ts   ← option ใช้ aggregator แทน
└── webhooks/
    └── *.controller.ts
```

แต่ละ provider implement interface:
```ts
interface LogisticsProvider {
  quote(input: QuoteInput): Promise<Quote[]>;
  createShipment(input: ShipmentInput): Promise<Shipment>;
  printLabel(shipmentId: string): Promise<Buffer>;
  bookPickup(shipmentId: string, time: Date): Promise<void>;
  track(trackingNumber: string): Promise<TrackingEvent[]>;
  cancel(shipmentId: string): Promise<void>;
}
```

## Data
- `logistics.shipment`
- `logistics.tracking_event`
- `logistics.label`
- `logistics.pickup_booking`
- `logistics.claim`

## Dependency
- Smart Checkout (04) — quote ขณะ checkout
- Payment (05) — delivered → release escrow
- Local Commerce (08) — rider integration

## Acceptance (Phase 2)
- [ ] ลูกค้าเห็นตัวเลือกขนส่ง ≥ 3 เจ้า + ราคา
- [ ] พิมพ์ใบปะหน้าได้จาก dashboard
- [ ] Tracking event มาเข้าระบบใน < 5 นาที (webhook)
- [ ] รองรับ COD
