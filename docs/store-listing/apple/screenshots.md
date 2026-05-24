# Apple Screenshots — Specs

Apple requires 3-10 screenshots PER size. The minimum required device
sizes since iOS 18 are:

- **6.7" iPhone Display** — 1290×2796 px (iPhone 15 Pro Max, 16 Pro Max)
- **6.5" iPhone Display** — 1242×2688 px (iPhone 11 Pro Max, XS Max) — OPTIONAL since 2024
- **iPad Pro 12.9" 6th Gen Display** — 2048×2732 px

The 6.7" set will up-scale for older sizes automatically. We submit
only 6.7" + 12.9" iPad to minimize maintenance.

## Required Screens (6.7" — 5 minimum)

1. **Feed-first hero** — `/feed` with 2 video tiles + caption
   - Tagline overlay: "เลื่อนดูคลิป กดซื้อได้ทันที"
2. **Local Commerce map** — `/local` with 5 nearby shop pins
   - Tagline: "ร้านอาหาร คาเฟ่ ของชำ ใกล้คุณ"
3. **Product detail w/ video** — `/product/:id` (MobilePDP)
   - Tagline: "ดูคลิปจริง รีวิวจริง ราคาเดียว"
4. **Checkout** — `/checkout` with PromptPay QR
   - Tagline: "ชำระเงินปลอดภัย ส่งของไว"
5. **Wallet + Rewards** — `/rewards`
   - Tagline: "เงินคืน + คูปอง — ใช้ได้ทันที"

## Required Screens (iPad 12.9" — 3 minimum)

1. **Feed + side panel** — desktop variant of `/feed/videos`
2. **Merchant dashboard** — `/merchant` with KPI cards
3. **Wallet desktop view** — `/wallet`

## Generation Pipeline

ทำผ่าน Storybook + Playwright (Phase 18) — แต่สำหรับ Phase 17 ใช้
manual capture:

```bash
# 1. Run app on simulator
cd apps/web && pnpm cap:open:ios
# pick iPhone 15 Pro Max simulator

# 2. Capture inside simulator via Cmd+S
#    File → Save Screen
#    Files land in ~/Desktop/ named like "Simulator Screen Shot..."

# 3. Crop to bare status bar (no time/battery) using ScreenshotEditor
#    or use Apple Frames v3 from Federico Viticci for branded frames
```

## Asset Storage

หลัง capture เสร็จ บันทึกเป็น:

```
docs/store-listing/apple/screenshots/
├── 6.7-iphone/
│   ├── 01-feed.png
│   ├── 02-local.png
│   ├── 03-product.png
│   ├── 04-checkout.png
│   └── 05-rewards.png
└── 12.9-ipad/
    ├── 01-feed.png
    ├── 02-merchant.png
    └── 03-wallet.png
```

(เก็บใน LFS เพราะ binary ใหญ่ — TODO: setup git-lfs ใน Phase 18)
