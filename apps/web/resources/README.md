# Mobile App Brand Assets

Source files สำหรับ generate icon + splash ในทุก resolution
ที่ Capacitor / iOS / Android / PWA ต้องการ

## ไฟล์ในโฟลเดอร์นี้

| File | Purpose | Used by |
|------|---------|---------|
| `logo.svg` | NP monogram + brand bg (1:1) | base ของ `icon.png` (1024) |
| `splash.svg` | logo + brand bg เต็มจอ (2732×2732) | base ของ `splash.png` |
| `icon.png` | rendered จาก `logo.svg` | `@capacitor/assets` input |
| `splash.png` | rendered จาก `splash.svg` | `@capacitor/assets` input |

> `*.png` จะถูก auto-generated โดย `pnpm assets:build`
> (ใช้ `sharp` แปลง SVG → PNG ก่อน feed เข้า `@capacitor/assets`)

## วิธีเปลี่ยนเป็นโลโก้จริง

ทางที่ 1 — แก้ SVG ตรงนี้:
1. เปิด `logo.svg` ใน Figma / Illustrator / Inkscape
2. ทดแทน NP monogram → ของจริง (ขนาดต้องเหลือ safe-zone 80% — 102.4px ขอบแต่ละด้าน)
3. คงสีพื้นหลัง `#FF3E5C` (brand pink) สำหรับ Android maskable icon ที่ต้องเป็น 1:1 ไม่มี alpha
4. ทำเหมือนกันกับ `splash.svg`

ทางที่ 2 — ใส่ PNG ตรง:
1. เตรียม `icon.png` 1024×1024 (RGB, opaque)
2. เตรียม `splash.png` 2732×2732 (logo อยู่ตรงกลาง ~30% ของจอ)
3. ลบ `*.svg` ออก (หรือคงไว้ก็ได้ — script จะข้าม render ถ้า PNG ใหม่กว่า)

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
