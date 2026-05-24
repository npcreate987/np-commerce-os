# Google Play — Screenshots Spec

Minimum 2, maximum 8 screenshots PER device size. Aspect ratio 16:9 or
9:16 (vertical preferred for phones).

## Sizes Needed

- **Phone**: 1080 × 1920 px (9:16) — REQUIRED, min 2
- **7-inch tablet**: 1200 × 1920 px (9:16) — REQUIRED if app supports tablets
- **10-inch tablet**: 1600 × 2560 px (9:16) — OPTIONAL

## Feature Graphic (banner)

- **Size**: 1024 × 500 px (mandatory)
- **No transparency**, no text on edges (Google may crop)
- ดู `docs/store-listing/shared/feature-graphic.md` สำหรับ design spec

## Recommended Order (Phone)

1. **Feed hero** — same as Apple #1 with TH overlay
2. **Local commerce** — map + 5 nearby shops
3. **Product detail** — video + reviews
4. **Checkout w/ PromptPay** — secure payment cue
5. **Wallet rewards**
6. **Profile + notifications** — push opt-in tutorial

## Asset Storage

```
docs/store-listing/google/screenshots/
├── phone/
│   ├── 01-feed.png
│   ├── 02-local.png
│   ├── 03-product.png
│   ├── 04-checkout.png
│   ├── 05-rewards.png
│   └── 06-profile.png
├── tablet-7/
│   ├── 01.png
│   └── 02.png
└── feature-graphic.png
```
