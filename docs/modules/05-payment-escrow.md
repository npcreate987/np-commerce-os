# Module 05 — Payment / Escrow

> ระบบชำระเงินกลาง: ป้องกันโกง โอนแล้วหาย สินค้าไม่ตรงปก

## Flow
```
ลูกค้าชำระเงิน
   ↓
ระบบถือเงินไว้ (escrow held)
   ↓
ร้านค้าส่งสินค้า (shipment created)
   ↓
ลูกค้าได้รับสินค้า (delivered + confirmed)
   ↓
ระบบปล่อยเงินให้ร้านค้า (escrow released → payout)
```

## Trigger การปล่อยเงิน (release)
- ลูกค้ากด **ยืนยันรับของ** → ปล่อยทันที
- หรือ **auto-release** หลัง delivered 3 วัน (ถ้าไม่มี dispute)
- หาก dispute → freeze จนกว่าจะปิดเคส

## ฟีเจอร์หลัก
- รองรับวิธีจ่าย: **PromptPay**, **บัตรเครดิต/เดบิต**, **Mobile Banking**, **TrueMoney**, **Rabbit LINE Pay**
- Escrow ledger (double-entry)
- Refund engine (full / partial)
- Payout (auto schedule + manual)
- Fee structure (per-transaction + per-payment-method)
- Reconciliation รายวันกับ payment gateway

## Ledger (double-entry แบบย่อ)
| Event | Debit | Credit |
|-------|-------|--------|
| ลูกค้าจ่าย | `escrow_holding` (+) | `gateway_clearing` (+) |
| ปล่อยเงินร้าน | `merchant_payable` (+) | `escrow_holding` (-) |
| คืนเงิน | `customer_refund` (+) | `escrow_holding` (-) |
| Payout | `bank_out` (+) | `merchant_payable` (-) |

## Data
- `payment.transaction`
- `payment.escrow_entry`
- `payment.refund`
- `payment.payout`
- `payment.fee`
- `payment.reconciliation`

## Dependency
- Smart Checkout (04)
- NP Protect (06) — risk freeze
- Logistics Hub (07) — delivered signal
- Admin (11) — operator manual release

## ผู้ให้บริการ (Phase 1)
- **Omise** (card + wallet)
- **PromptPay** (ผ่าน bank API หรือ aggregator)

ใส่ adapter pattern ใน `apps/api/src/modules/payment/providers/` เพื่อสลับ provider ได้

## Acceptance
- [ ] เงินทุกบาทมีใน ledger ตรวจสอบได้
- [ ] reconciliation รายวันมี diff = 0
- [ ] refund ภายใน 7 วันทำการ
- [ ] payout ตรงตามรอบ
