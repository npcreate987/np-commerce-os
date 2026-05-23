# Mobile Access Guide — NP Commerce OS

NP Commerce OS รองรับ **3 แนวทาง** ของการเข้าใช้งานผ่านมือถือ ตั้งแต่ง่ายไปยาก:

```
[1] PWA ผ่าน LAN  →  [2] PWA install (Add to Home Screen)  →  [3] Capacitor native (App Store / Play Store)
```

## 1) ดูผ่านมือถือใน WiFi เดียวกัน (PWA ผ่าน LAN) — ใช้ได้ทันที

**เงื่อนไข**: มือถือ + Mac อยู่ WiFi เดียวกัน

### ขั้นตอน

```bash
# 1. หา LAN IP ของ Mac
ipconfig getifaddr en0
# ตัวอย่างผลลัพธ์: 192.168.1.42

# 2. รัน API (bind 0.0.0.0 อยู่แล้ว — เข้าถึงจาก LAN ได้)
cd /Users/ii/Documents/np-commerce-os/apps/api
pnpm dev

# 3. รัน Web bind 0.0.0.0
cd /Users/ii/Documents/np-commerce-os/apps/web
WEB_HOST=0.0.0.0 pnpm dev
# Next.js จะ log "Network: http://0.0.0.0:3000" → เข้าจากมือถือผ่าน LAN IP
```

**บนมือถือ**: เปิด Safari/Chrome → `http://192.168.1.42:3000`

> Web `apps/web/src/lib/env.ts` มี auto-detect — ถ้า `NEXT_PUBLIC_API_URL` เป็น `localhost` แต่ผู้ใช้เปิดจาก LAN IP มันจะใช้ host เดียวกันสำหรับ API call โดยอัตโนมัติ ไม่ต้องตั้งค่าเพิ่ม

### CORS

API ตอน dev ยอม origin ที่ match pattern:
- `localhost`, `127.0.0.1`, `0.0.0.0`
- `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x` (private LAN)
- `capacitor://localhost`, `http://localhost` (Capacitor)

ตอน prod ตั้ง `WEB_ORIGIN=https://your-domain.com,...` ใน `apps/api/.env`

## 2) ติดตั้ง PWA บนหน้าจอ (Add to Home Screen)

หลังเปิดผ่าน LAN ในข้อ 1:

**iOS Safari**: กดปุ่ม Share (□↑) → **Add to Home Screen** → ตั้งชื่อ → Add
- เปิดจากไอคอนหน้าจอจะเป็น standalone (ไม่มี address bar) — ดูเหมือน native app
- รองรับ offline (ผ่าน next-pwa service worker ตอน build prod)

**Android Chrome**: เมนู (⋮) → **Install app** หรือ **Add to Home screen**
- ติดตั้งเป็น PWA จริง มี icon, splash screen
- เปิดเป็น standalone window

ทดสอบ PWA จริง (prod mode มี service worker):

```bash
cd apps/web && pnpm preview   # build + start prod (ulimit -n 8192)
```

PWA จะ disable ใน `next dev` (เพื่อ HMR เร็ว) ดังนั้นต้อง `pnpm preview` หรือ `pnpm build && pnpm start:lan` เพื่อทดสอบ service worker จริง

## 3) Build เป็น Native App (iOS / Android) ด้วย Capacitor

### เตรียมเครื่องครั้งแรก

```bash
# iOS — ต้องมี Xcode + Apple Developer account (ฟรีก็ได้สำหรับ test บนเครื่องตัวเอง)
xcode-select --install
sudo gem install cocoapods

# Android — Android Studio + JDK 17
brew install --cask android-studio
brew install openjdk@17
```

### ขั้นตอน Capacitor (ครั้งแรก)

```bash
cd /Users/ii/Documents/np-commerce-os/apps/web

# 1. ติดตั้ง Capacitor deps (มีใน package.json แล้ว)
pnpm install

# 2. Build static export สำหรับ bundle ลง app
BUILD_STATIC=true pnpm build
# ผลลัพธ์อยู่ใน apps/web/out/

# 3. เพิ่ม native platforms (ครั้งแรกเท่านั้น)
pnpm cap:add:ios
pnpm cap:add:android

# 4. Sync static files เข้า native shell
pnpm cap:sync
```

### Dev mode — live reload จาก dev server (เร็วที่สุดสำหรับ iterate)

```bash
# Terminal 1: API
cd apps/api && pnpm dev

# Terminal 2: Web dev (bind 0.0.0.0)
cd apps/web && WEB_HOST=0.0.0.0 pnpm dev

# Terminal 3: Capacitor live-reload (มือถือต่อ WiFi เดียวกับ Mac)
cd apps/web && CAP_SERVER_URL=http://192.168.1.42:3000 pnpm cap:dev:ios
# หรือ
cd apps/web && CAP_SERVER_URL=http://192.168.1.42:3000 pnpm cap:dev:android
```

Capacitor จะเปิด simulator/device + ติดต่อ web dev server ผ่าน LAN
แก้โค้ดที่ `apps/web/src/...` แล้วเห็นผลทันทีบนมือถือ

### Production build (พร้อมขึ้น App Store / Play Store)

```bash
# 1. Static export
cd apps/web
BUILD_STATIC=true pnpm build

# 2. Sync เข้า native projects
pnpm cap:sync

# 3a. iOS — Xcode (sign + archive + upload TestFlight/App Store)
pnpm cap:open:ios

# 3b. Android — Android Studio (build APK/AAB + upload Play Console)
pnpm cap:open:android
```

### โครงสร้าง Capacitor (หลัง `cap:add`)

```
apps/web/
├── capacitor.config.ts       # Config หลัก (appId, appName, server URL)
├── ios/                      # ← สร้างโดย cap:add:ios (Xcode project)
│   └── App/
│       ├── App.xcodeproj/
│       └── App/
└── android/                  # ← สร้างโดย cap:add:android (Gradle project)
    ├── app/
    └── build.gradle
```

## รายละเอียดทางเทคนิค

### Service Worker (PWA)
- ปลั๊กอิน: `@ducanh2912/next-pwa`
- Disable ใน `next dev` (config: `disable: NODE_ENV === 'development'`)
- Auto-register ใน prod
- Cache: page navigation, static assets, image responses

### Manifest
- `apps/web/public/manifest.json`
- `theme_color: #FF3E5C` (brand pink)
- `display: standalone` (ไม่มี browser UI)
- TODO: PWA icons จริงจาก logo (Phase 1 ใช้ placeholder)

### Capacitor Plugins ที่ติดตั้งไว้
- `@capacitor/app` — handle deep links / app lifecycle
- `@capacitor/status-bar` — ปรับ status bar เป็น brand color
- `@capacitor/splash-screen` — splash 1.2 วินาที สี brand

### Permission ที่จะใช้ใน Phase ถัด ๆ
| Phase | Permission | ใช้สำหรับ |
|---|---|---|
| 4 (Local) | Geolocation | ร้านใกล้ฉัน, Rider tracking |
| 4 (Local) | Push notifications | Order status, promo |
| 5 (Marketing) | Camera | QR code (Creator link) |
| 5 (Marketing) | Photo Library | Upload product images |

ทุก permission ติดตั้งผ่าน `@capacitor/<plugin>` ตอนถึง Phase นั้น ๆ
