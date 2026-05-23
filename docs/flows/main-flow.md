# Main Flow — NP Commerce OS

## End-to-end Flow ภาพรวม

```
TikTok / Social / Creator / Ads
        │
        ▼
Product Page / Local Store Page
        │
        ▼
Smart Checkout
        │
        ▼
Payment + Escrow ─────► NP Protect (risk check)
        │
        ▼
NP Logistics Hub
        │
        ▼
Delivered → Confirm
        │
        ▼
Escrow Release → Merchant Payout
        │
        ▼
Customer Review / CRM
        │
        ▼
Retarget / Loyalty / ซื้อซ้ำ
```

---

## Flow ละเอียดที่สำคัญ

### 1. ซื้อของผ่านลิงก์ TikTok
```
[Creator clip on TikTok]
   ↓ click bio link
[https://np.commerce/r/<creator>/p/<product>]
   ↓ Next.js render (ISR) + set attribution cookie (30d)
[Product Detail]
   ↓ click "ซื้อเลย"
[Smart Checkout — 1 page]
   ↓ pick address → pick courier → apply coupon → choose payment
[Payment Gateway]
   ↓ webhook: payment.succeeded
[Order Created — status: paid_escrow_held]
   ↓ notify merchant (push + email)
[Merchant prints label → ships]
   ↓ Logistics webhook: in_transit / delivered
[Customer marks "Received" or auto after 3 days]
   ↓
[Escrow released → Merchant payable]
   ↓ daily payout cron
[Bank Out → Merchant bank account]
   ↓
[CRM trigger: thank-you + review + repurchase coupon (7d)]
```

### 2. สั่งร้านอาหารใกล้บ้าน (Local Commerce)
```
[Customer opens "Local Feed"]
   ↓ geo from device or saved address
[ร้านในรัศมี X km]
   ↓ pick shop → pick menu/variant/add-on
[Cart with shop fee + delivery quote]
   ↓ pick "ส่งทันที" or "นัดเวลา"
[Payment (mostly PromptPay/Wallet)]
   ↓
[Shop notified — start preparing]
   ↓ "Ready for pickup"
[Rider Dispatch]
   ├── Internal rider pool (3 km)
   ├── Grab Express (fallback)
   └── Lalamove (fallback)
   ↓
[Rider en route — realtime map for customer]
   ↓
[Delivered → confirm → escrow released → settle]
```

### 3. Dispute (มีปัญหากับออเดอร์)
```
[Customer taps "แจ้งปัญหา" within order]
   ↓ pick reason (ไม่ตรงปก / ของเสีย / ไม่ครบ / ไม่ได้รับ)
   ↓ upload รูป/วิดีโอ
[Dispute Created — Escrow frozen]
   ↓ notify merchant (48 hr to respond)
[Merchant responds: agree refund | counter-evidence]
   ├─ agree → refund processed
   └─ disagree → escalate to Admin/AI
        ↓ Admin/AI ตัดสิน
        ↓ refund full / partial / reject
[Resolution → Escrow released accordingly]
```

### 4. Creator earn commission
```
[Creator picks product → generate link]
   ↓ short link (e.g. np.cm/abc)
[Creator posts on TikTok/IG/LINE]
   ↓ click → cookie referral_id (30d)
[Customer purchases]
   ↓ purchase event tagged with creator_id
[Commission ledger entry — status: pending]
   ↓ wait for escrow_released
[Commission status: ready]
   ↓ cron payout (weekly, threshold)
[PromptPay to Creator]
```

---

## State Machine: Order
```
draft
  → pending_payment
    → paid_escrow_held
      → ready_to_ship
        → shipped
          → delivered
            → completed   (escrow released)
            → disputed   → refunded | completed
      → cancelled       (no payment in 30 min)
  → expired (cart abandoned)
```

## State Machine: Escrow
```
created
  → held
    → released   (auto 3d after delivered, or customer confirm)
    → refunded   (full / partial)
    → frozen     (dispute)
      → released
      → refunded
```
