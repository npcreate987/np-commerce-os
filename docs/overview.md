# NP Commerce OS — Overview (สเปกเต็ม)

> ไฟล์นี้คือ "single source of truth" ของแนวคิดโปรเจ็กต์
> เนื้อหามาจาก spec ต้นฉบับที่เจ้าของโปรเจ็กต์เป็นคนเขียน
> เปลี่ยนแปลงต้องผ่าน ADR ใน `docs/decisions/`

---

## ชื่อโปรเจ็กต์

**NP Commerce OS** — ระบบ Commerce กลางสำหรับร้านค้าออนไลน์ ร้านค้าท้องถิ่น Creator และลูกค้า

---

## แนวคิดหลัก

ใช้ **TikTok / Social Media** เป็นช่องทาง "ดึงลูกค้า"
แต่ให้ **ระบบของเรา** เป็นศูนย์กลางในการ:

- ปิดการขาย
- รับชำระเงิน
- เก็บ Data ลูกค้า
- จัดการขนส่ง
- คุ้มครองผู้ซื้อ
- ช่วยร้านค้าทำการตลาดซ้ำ
- ลดการพึ่งพาแพลตฟอร์มเดียว

---

## ปัญหาที่ระบบนี้แก้

### ฝั่งร้านค้า
- ค่าธรรมเนียมแพลตฟอร์มสูง
- ไม่มี Data ลูกค้าเป็นของตัวเอง
- Retarget ลูกค้าเก่ายาก
- ถูกผูกขาดด้านขนส่ง / ช่องทางขาย
- ขายผ่าน TikTok ได้ แต่ต่อยอดลูกค้าไม่ได้

### ฝั่งลูกค้า
- กลัวโดนโกง
- ไม่มั่นใจร้านค้า
- อยากเลือกขนส่งเอง
- อยากซื้อสินค้าง่าย เร็ว ปลอดภัย
- อยากได้โปร / ร้านใกล้ตัว / ของน่าสนใจ

---

## โครงสร้างระบบหลัก

```
NP Commerce OS
├── Customer Platform
├── Merchant Platform
├── Creator / Affiliate Center
├── Smart Checkout
├── Payment / Escrow
├── NP Protect
├── NP Logistics Hub
├── NP Local Commerce
├── NP Marketing Engine
├── AI Engine
├── Admin Platform
├── Data Layer
└── Integration Layer
```

รายละเอียดแต่ละโมดูลอยู่ใน [`docs/modules/`](./modules/)

---

## Flow ภาพรวม

```
TikTok / Social / Creator / Ads
        ↓
Product Page / Local Store Page
        ↓
Smart Checkout
        ↓
Payment + Escrow
        ↓
NP Protect
        ↓
NP Logistics Hub
        ↓
Customer Review / CRM
        ↓
Retarget / Loyalty / ซื้อซ้ำ
```

ดูเต็มได้ที่ [`docs/flows/main-flow.md`](./flows/main-flow.md)

---

## จุดแข็งของโปรเจ็กต์

1. ไม่แข่ง TikTok โดยตรง แต่ใช้ TikTok เป็น Traffic
2. ร้านค้าได้ Data ลูกค้าเอง
3. ลูกค้าซื้อได้ปลอดภัยกว่า (Escrow + NP Protect)
4. มีระบบขนส่งไม่ผูกขาด
5. รองรับทั้งสินค้าออนไลน์และร้านค้าท้องถิ่น
6. มี Creator ช่วยขาย
7. มี AI ช่วยวิเคราะห์
8. สร้าง Marketing Engine ของตัวเองได้ในระยะยาว

---

## เป้าหมายสุดท้าย

NP Commerce OS คือระบบกลางที่ช่วยให้ร้านค้าใช้ TikTok และ Social Media ดึงลูกค้าเข้ามา แต่ให้ระบบของเราเป็นเจ้าของ:

- การขาย
- การชำระเงิน
- ขนส่ง
- Data ลูกค้า
- การตลาดระยะยาว

โดยมีเป้าหมายสุดท้าย คือ:

> **ร้านค้าอยู่รอด · ลูกค้าซื้ออย่างมั่นใจ · Creator มีรายได้ · แพลตฟอร์มมี Data ของตัวเอง**
