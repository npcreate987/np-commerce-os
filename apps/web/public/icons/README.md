# PWA Icons

ก่อน production build ต้องวางไฟล์เหล่านี้ (สร้างจากโลโก้จริง):

- `icon-192.png` — 192×192 (any)
- `icon-512.png` — 512×512 (any)
- `maskable-512.png` — 512×512 (maskable, มี safe zone 80%)
- `apple-touch-icon.png` — 180×180 (สำหรับ iOS)

วิธี generate อัตโนมัติ:

```bash
pnpm dlx pwa-asset-generator ./logo.svg ./public/icons \
  --manifest ./public/manifest.json \
  --index ./src/app/layout.tsx \
  --opaque true \
  --background "#ffffff"
```

หรือใช้ https://realfavicongenerator.net แล้ววางไฟล์ลงโฟลเดอร์นี้
