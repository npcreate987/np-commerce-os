# apps/web — Next.js + PWA

> Customer / Merchant / Creator / Admin frontend (one app, multi route-group)

## เริ่ม Phase 1
```bash
# จาก root ของ monorepo
pnpm dlx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
pnpm add -D @ducanh2912/next-pwa
```

แล้วใส่ใน `next.config.mjs`:
```ts
import withPWA from '@ducanh2912/next-pwa';
export default withPWA({ dest: 'public' })({ /* next config */ });
```

## Route Group Plan
```
src/app/
├── (marketing)/
├── (customer)/
├── (merchant)/
├── (creator)/
├── (admin)/
└── api/
```

## PWA Checklist (ก่อน ship Phase 1)
- [ ] `public/manifest.json` (name, icons 192/512/maskable, theme/bg color)
- [ ] Service worker (cache + offline shell)
- [ ] iOS meta tags (`apple-touch-icon`, `apple-mobile-web-app-*`)
- [ ] Safe area (`env(safe-area-inset-*)`)
- [ ] `viewport-fit=cover` ใน meta viewport
- [ ] Lighthouse PWA score ≥ 90
