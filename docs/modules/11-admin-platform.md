# Module 11 — Admin Platform

> Console สำหรับทีม Ops / Support / Finance / Risk

## ฟีเจอร์หลัก
- **Overview**: KPI ภาพรวม (GMV, orders, signup, fraud rate)
- **Merchants**: ตรวจ KYC, อนุมัติ/ระงับร้าน, ดู risk score
- **Customers**: ค้นหา, view profile, ช่วยรีเซ็ตรหัส, blacklist
- **Disputes**: คิวเคลม, ทำคำตัดสิน
- **Fraud**: คิวออเดอร์น่าสงสัย, อนุมัติ/บล็อก
- **Logistics**: ดูปัญหาขนส่ง, เคลม, ผู้ให้บริการ
- **Finance**: reconciliation, payout queue, refund queue
- **Marketing**: เปิด/ปิด campaign, ดู performance
- **System**: feature flag, A/B test, config

## RBAC
| Role | สิทธิ์ |
|------|--------|
| `super_admin` | ทุกอย่าง |
| `ops` | merchant, order, dispute |
| `finance` | payment, payout, refund |
| `risk` | fraud, dispute, blacklist |
| `support` | customer, ticket |
| `marketing` | campaign, coupon |
| `viewer` | read-only ทุกอย่าง |

## Audit Log
- ทุก action ของ admin บันทึก: `who, what, when, before, after, ip, ua`
- เก็บ ≥ 1 ปี

## Data
- `admin.user`
- `admin.role`, `admin.permission`
- `admin.audit_log`
- `admin.ticket` (CS)
- `admin.feature_flag`

## Dependency
- ทุก module (read + selective write)
- AI Engine — แสดง suggestion

## Acceptance
- [ ] Audit log ครอบคลุม 100% ของ write action
- [ ] Search merchant/order < 500ms
- [ ] 2FA บังคับสำหรับ super_admin / finance / risk
