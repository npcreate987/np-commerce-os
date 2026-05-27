# Mobile App Brand Assets — TuKTuK

Source files สำหรับ generate icon + splash ในทุก resolution
ที่ Capacitor / iOS / Android / PWA ต้องการ

## ไฟล์ในโฟลเดอร์นี้

| File | Purpose | Used by |
|------|---------|---------|
| `icon.png` | TuKTuK artwork ต้นฉบับ (1024×1024) — แก้ไฟล์นี้เพื่อเปลี่ยนไอคอน | source-of-truth สำหรับทุก platform |
| `icon-only.png` | alias ของ `icon.png` (สร้างอัตโนมัติโดย `assets:render`) | `@capacitor/assets` slot สำหรับ "icon" |
| `icon-foreground.png` | alias ของ `icon.png` (สร้างอัตโนมัติ) | Android adaptive foreground |
| `logo.png` | alias ของ `icon.png` (สร้างอัตโนมัติ) | fallback logo สำหรับ `@capacitor/assets` |
| `logo.svg` | TuKTuK wordmark + neon bg (1:1) | fallback ตอน `icon.png` ไม่มี + บางส่วนของ splash |
| `splash.svg` | TuKTuK wordmark + neon bg เต็มจอ (2732×2732) | base ของ `splash.png` |
| `splash.png` | rendered จาก `splash.svg` | `@capacitor/assets` input |

> `*.png` ที่เป็น alias จะถูก auto-generated โดย `pnpm assets:build`
> ห้ามแก้ไฟล์ alias โดยตรง — แก้ที่ `icon.png` แล้ว rerun pipeline

## วิธีเปลี่ยนไอคอน

วิธีหลัก — ใส่ PNG ใหม่:
1. เตรียมรูปไอคอน 1024×1024 (RGB, opaque)
2. แทนที่ `icon.png` ในโฟลเดอร์นี้
3. รัน `pnpm assets:build` — script จะสร้าง alias (`icon-only.png`, `icon-foreground.png`, `logo.png`) + PWA icons (PNG/WebP) + iOS/Android native sizes ให้อัตโนมัติ

วิธีที่สอง — แก้ SVG (เฉพาะ wordmark):
1. เปิด `logo.svg` ใน Figma / Illustrator / Inkscape
2. ทดแทน TuKTuK wordmark → ของจริง (ขนาดต้องเหลือ safe-zone 80% — 102.4px ขอบแต่ละด้าน)
3. คงพื้นหลังเป็น opaque (ไม่มี alpha) สำหรับ Android maskable icon ที่ต้องเป็น 1:1
4. ลบ `icon.png` ออก → script จะ render ใหม่จาก SVG
5. ทำเหมือนกันกับ `splash.svg` สำหรับ splash screen

## รัน pipeline

```bash
cd apps/web

# 1) SVG → PNG (base) + PWA icons + apple-touch-icon
pnpm assets:render

# 2) Generate all native sizes (เรียก @capacitor/assets)
pnpm assets:generate

# รวมทั้งสองในคำสั่งเดียว
pnpm assets:build
```

ผลลัพธ์:

```
apps/web/
├── resources/
│   ├── icon.png             ← rendered, 1024×1024
│   └── splash.png           ← rendered, 2732×2732
├── public/icons/
│   ├── icon-192.png         ← PWA
│   ├── icon-512.png         ← PWA
│   ├── maskable-512.png     ← PWA Android adaptive
│   └── apple-touch-icon.png ← iOS Safari home-screen
└── ios|android/             ← all platform sizes
```
