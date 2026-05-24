# Deep Link Verification Files (Universal Links / App Links)

ไฟล์ในโฟลเดอร์นี้บอก iOS และ Android ว่าโดเมน `np.app` (และโดเมนถัด ๆ ไป)
"จับคู่" กับ NP Commerce app — ทำให้ลิงก์ `https://np.app/order/123`
เปิดในแอปแทนเว็บ

## `apple-app-site-association` (iOS — Universal Links)

ต้องเสิร์ฟ:
- บนทุกโดเมน production (`np.app`, `app.np.app`, `cdn.np.app` ฯลฯ)
- ผ่าน HTTPS (มี cert ที่ valid)
- Content-Type: `application/json` (ไม่ใช่ `application/pkcs7-mime` แบบเก่า)
- ห้ามมีนามสกุล `.json` ในชื่อไฟล์
- ห้าม redirect (3xx)

**TODO ก่อน prod**: แทน `TEAMIDXXXX` ด้วย Apple Developer Team ID จริง
- ดูได้ที่ developer.apple.com → Membership → Team ID (10 chars)
- Bundle ID = `app.np.commerce` ตามที่ตั้งใน `capacitor.config.ts`

ตรวจสอบ Apple AASA validator:
- https://branch.io/resources/aasa-validator/

## `assetlinks.json` (Android — App Links)

ต้องเสิร์ฟ:
- บนทุกโดเมน production
- ผ่าน HTTPS
- Content-Type: `application/json`
- ห้าม redirect

**TODO ก่อน prod**: ใส่ SHA-256 cert fingerprint ของ app signing key
- หลัง upload AAB ครั้งแรกบน Play Console เปิด Play App Signing → Copy
  "Deployment certificate" SHA-256 fingerprint
- ก่อนหน้านั้นใช้ fingerprint ของ debug key local:
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore \
    -alias androiddebugkey -storepass android -keypass android
  ```

ตรวจสอบ Google Asset Links tester:
- https://developers.google.com/digital-asset-links/tools/generator

## Server-side serving notes

Next.js เสิร์ฟไฟล์ใน `apps/web/public/` ที่ root โดยอัตโนมัติ
ตรวจสอบหลัง deploy:

```bash
curl -I https://np.app/.well-known/apple-app-site-association
# ต้องเห็น 200 + Content-Type: application/json (อาจต้องตั้ง header ใน next.config)

curl -I https://np.app/.well-known/assetlinks.json
```

ถ้า Vercel: เพิ่ม header rewrite ใน `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/.well-known/apple-app-site-association",
      "headers": [{ "key": "content-type", "value": "application/json" }]
    }
  ]
}
```
