# Module 09 — NP Marketing Engine

> ใช้ TikTok ดึงคน แต่สร้าง Traffic + ฐานลูกค้าของเราเองในระยะยาว

## เป้าหมาย
- ลูกค้ากลับมาซื้อซ้ำโดยไม่ผ่าน TikTok
- ร้านเข้าถึงลูกค้าได้ตรง (broadcast / retarget)

## ฟีเจอร์หลัก
- **Short Video Feed** (TikTok-like ในแอปเรา)
- **โปรวันนี้** (curated)
- **Flash Deal** (countdown + จำนวนจำกัด)
- **ร้านใกล้ฉัน** (geo)
- **คูปอง** (ส่วนลด, ส่งฟรี, แลกของ, code/auto)
- **แต้มสะสม** (loyalty)
- **Referral** (ลูกค้าชวนลูกค้า, ทั้งคู่ได้คูปอง)
- **Broadcast** (LINE OA, Push, Email, SMS)
- **Retarget** (cart-abandoned, win-back, browsed-not-bought)
- **Boost Product** (ร้านจ่ายเพิ่ม → ดันขึ้น feed)
- **Creator Campaign** (ร้านจ้าง creator แบบเป็น campaign)

## Engine Architecture
```
events (purchase, view, cart) → event bus
       ↓
segment engine (ตัด segment ลูกค้า)
       ↓
campaign engine (trigger broadcast/retarget)
       ↓
delivery (push / email / LINE / SMS)
```

## Coupon Types
- `PERCENT` (X%)
- `AMOUNT` (X บาท)
- `FREE_SHIPPING`
- `BUY_X_GET_Y`
- `MIN_SPEND` (กระตุ้นยอด)
- `FIRST_PURCHASE`
- `WIN_BACK` (target ลูกค้าไม่ซื้อ > 60 วัน)

## Loyalty Tier (ตัวอย่าง)
| Tier | เกณฑ์ | สิทธิ์ |
|------|------|--------|
| Bronze | < 5,000 บาท/ปี | 1 บาท = 1 แต้ม |
| Silver | 5,000–20,000 | 1 บาท = 1.5 แต้ม + ส่งฟรี 1 ครั้ง/เดือน |
| Gold | > 20,000 | 1 บาท = 2 แต้ม + ส่งฟรีไม่อั้น + early access |

## Data
- `marketing.coupon`
- `marketing.coupon_redemption`
- `marketing.loyalty_point`
- `marketing.segment`
- `marketing.campaign`
- `marketing.broadcast_log`
- `marketing.referral`

## Dependency
- Customer Platform (01) — feed/coupon UI
- Smart Checkout (04) — apply coupon
- AI Engine (10) — segment auto + recommendation

## Acceptance (Phase 5)
- [ ] Retarget cart-abandoned ภายใน 30 นาที
- [ ] Coupon redeem conversion > 25%
- [ ] Repeat purchase rate (30 วัน) > 20%
