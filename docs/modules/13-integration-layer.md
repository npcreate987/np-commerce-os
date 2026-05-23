# Module 13 — Integration Layer

> ตัวกลางเชื่อม external service ทั้งหมด ผ่าน adapter pattern

## หลักการ
- **ทุก external dependency = adapter** ใน `apps/api/src/modules/integration/`
- มี interface กลาง → swap provider ได้
- มี **circuit breaker** + **retry with backoff**
- มี **webhook receiver** แยกชัด

## รายการ Integration

### Payment Gateway
- Omise
- 2C2P
- SCB Easy Pay
- TrueMoney Wallet
- PromptPay (ผ่าน bank API)

### Logistics
- Flash Express API
- Kerry Express API
- J&T Express API
- Thailand Post API
- DHL API
- Shippop (aggregator, optional)
- Grab Express API
- Lalamove API

### Social / Traffic Source
- **TikTok**: deep link parser, attribution
- **Facebook / Instagram**: link in bio, pixel
- **LINE OA**: messaging API + LIFF login
- **Google**: OAuth, Ads conversion

### Notification
- **FCM** (Android push)
- **APNs** (iOS push, ผ่าน Capacitor)
- **Web Push** (VAPID)
- **LINE Notify / LINE OA**
- **Email**: Postmark / Resend / SES
- **SMS**: ThaiBulkSMS / 2C2P SMS

### Auth / Identity
- **Auth.js (NextAuth)**
- **OTP**: SMS provider
- **Biometric** (เมื่อมี Capacitor): native

### Maps / Geo
- **Google Maps Platform** (geocoding, distance matrix, places)
- **OpenStreetMap** (fallback / cost saving)

### Storage / CDN
- Cloudflare R2 (S3-compatible)
- Cloudflare CDN
- Image transform: Cloudflare Images / imgproxy

### Analytics
- **Plausible / Umami** (privacy-first)
- **Posthog** (product analytics)
- **Sentry** (error)

### AI / LLM
- OpenAI / Anthropic / Google (เลือกราย task)
- Local: Ollama (เมื่อต้องการ on-prem)

## Webhook Pattern
```
external → POST /api/webhooks/<provider>
                   ↓ verify signature
                   ↓ enqueue job
                   ↓ ack 200
worker → ประมวลผล (idempotent ด้วย event id)
```

## Secret Management
- `.env` ใน dev เท่านั้น
- prod: **Vault / Doppler / 1Password Secrets** หรือ provider native (Railway/Vercel env)
- ห้าม commit
- rotate ทุก 90 วัน

## Acceptance
- [ ] ทุก integration มี health check
- [ ] Webhook idempotent
- [ ] รองรับ provider failover (อย่างน้อย 2 เจ้าใน payment + logistics)
