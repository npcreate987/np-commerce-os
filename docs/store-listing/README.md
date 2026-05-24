# Store Listing — NP Commerce

ทุกข้อความ ทุกสกรีนช็อต ทุก URL ที่ส่งให้ **Apple App Store** และ
**Google Play Store** เก็บไว้ที่นี่เป็น source of truth

```
docs/store-listing/
├── README.md             ← เริ่มที่นี่
├── apple/
│   ├── metadata.md       ← App name, subtitle, keywords, copy
│   ├── review-info.md    ← Demo account + review notes ส่ง Apple
│   └── screenshots.md    ← Spec ของ 6.7" / 6.5" / 5.5" / 12.9" iPad
├── google/
│   ├── metadata.md       ← Title, short description, full description
│   ├── data-safety.md    ← Data Safety form answer key
│   └── screenshots.md    ← Spec ของ Phone / 7" / 10" Tablet
└── shared/
    ├── icon.md           ← Spec ของ 1024×1024 icon + alternate marketing
    ├── feature-graphic.md ← Play Store 1024×500 banner
    └── press-kit.md      ← Logo packs, brand colors, tagline
```

## Workflow

1. **Update copy** — แก้ `apple/metadata.md` หรือ `google/metadata.md`
2. **Regenerate screenshots** — render จาก dev server หรือ design file
3. **Upload** — copy → paste เข้า App Store Connect / Play Console
4. **Submit for review** — ดู `docs/phase-17-store-compliance.md`
   "submission checklist" ก่อนกด

## Versioning

ไฟล์ทั้งหมดอยู่ใน git → ดู history ได้ว่า copy เวอร์ชันไหนใช้เมื่อไหร่
ตอนเปลี่ยน copy ให้ commit message: `docs(store): bump apple subtitle vN`
