/**
 * Phase 17 — Privacy Policy (public).
 *
 * Apple + Google + GDPR + PDPA all require a public-accessible, stable
 * URL for the privacy policy. App Store / Play Console listing fields
 * point here. The page is intentionally simple HTML so it works in
 * static export, isn't paywalled, and is reliably scannable by Apple's
 * review crawler.
 *
 * Source of truth for the actual legal copy lives in
 * `docs/legal/privacy-policy.md` — this page renders the same text. If
 * you update one, update the other.
 *
 * URL: `/legal/privacy` (production: https://np.app/legal/privacy)
 */

import Link from 'next/link';

export const metadata = {
  title: 'นโยบายความเป็นส่วนตัว · NP Commerce',
  description:
    'นโยบายความเป็นส่วนตัวของ NP Commerce — ข้อมูลที่เก็บ การใช้งาน การลบ และสิทธิ์ของผู้ใช้',
};

export default function PrivacyPolicyPage(): JSX.Element {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-ink-800 sm:px-6 sm:py-12">
      <header>
        <Link
          href="/"
          className="text-xs font-semibold text-brand hover:underline"
        >
          ← กลับหน้าแรก
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink-900">
          นโยบายความเป็นส่วนตัว
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          มีผลบังคับใช้: 24 พฤษภาคม 2026 · เวอร์ชัน 1.0
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">1. เกี่ยวกับเอกสารฉบับนี้</h2>
        <p className="text-sm leading-relaxed">
          เอกสารนี้อธิบายว่า NP Commerce (ดำเนินการโดย NP Co., Ltd.)
          เก็บข้อมูลอะไร ใช้ทำอะไร แชร์กับใคร และวิธีที่คุณควบคุมข้อมูลของตัวเอง
          เราปฏิบัติตาม{' '}
          <strong>พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</strong>{' '}
          และมาตรฐาน Apple App Store / Google Play Store
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">2. ข้อมูลที่เราเก็บ</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>
            <strong>ข้อมูลบัญชี:</strong> อีเมล, เบอร์โทรศัพท์, ชื่อที่ใช้แสดง,
            รหัสผ่าน (เก็บแบบ hashed)
          </li>
          <li>
            <strong>ข้อมูลการสั่งซื้อ:</strong> รายการสินค้า ที่อยู่จัดส่ง
            ประวัติชำระเงิน (เลขบัตรเครดิตจริงเก็บที่ผู้ให้บริการชำระเงิน Omise
            เท่านั้น เราเห็นเฉพาะ token)
          </li>
          <li>
            <strong>ข้อมูลพฤติกรรม:</strong> สินค้าที่คุณดู ค้นหา ใส่ตะกร้า ซื้อ
            แชร์ — ใช้แนะนำสินค้าและปรับฟีดวิดีโอ
            คุณปิดได้จากหน้า "ความเป็นส่วนตัว"
          </li>
          <li>
            <strong>ข้อมูลตำแหน่ง:</strong> เฉพาะตอนใช้ฟีเจอร์ /local หรือ
            ขับ Rider — ใช้แสดงร้านใกล้คุณและคำนวณค่าจัดส่ง ขอ permission
            ทุกครั้ง
          </li>
          <li>
            <strong>ข้อมูลอุปกรณ์:</strong> รุ่นมือถือ ระบบปฏิบัติการ
            APNs/FCM token (สำหรับส่ง push)
          </li>
          <li>
            <strong>เนื้อหาที่คุณอัปโหลด:</strong> วิดีโอฟีด รูปสินค้า รีวิว
            ข้อความแชท
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">3. ใช้ข้อมูลทำอะไร</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>ให้บริการตลาดสินค้าและจัดส่ง</li>
          <li>ยืนยันตัวตน ป้องกันการฉ้อโกง</li>
          <li>แนะนำสินค้าและเนื้อหาที่คุณน่าจะชอบ (ปิดได้)</li>
          <li>ส่งการแจ้งเตือนสำคัญ เช่น สถานะออเดอร์ โปร (ปิดได้)</li>
          <li>ปรับปรุงแอปและแก้บั๊ก (ผ่าน crash log)</li>
          <li>ทำตามกฎหมายภาษีและบัญชี</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">4. แชร์กับใคร</h2>
        <p className="text-sm leading-relaxed">
          เราไม่ขายข้อมูลของคุณให้ใคร เราแชร์เฉพาะตามความจำเป็นกับ:
        </p>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>
            <strong>ผู้ให้บริการชำระเงิน:</strong> Omise — ประมวลผลบัตรเครดิต
          </li>
          <li>
            <strong>ผู้ให้บริการขนส่ง:</strong> ตามที่คุณเลือกตอนชำระเงิน
          </li>
          <li>
            <strong>ผู้ให้บริการโครงสร้าง:</strong> AWS / Google Cloud,
            Sentry (crash log), Meilisearch (ค้นหา) —
            อยู่ภายใต้สัญญารักษาความลับ
          </li>
          <li>
            <strong>หน่วยงานราชการ:</strong> ตามคำสั่งศาล/หมายเรียก
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">5. สิทธิ์ของคุณ (PDPA)</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>
            <strong>ดูข้อมูลของคุณ:</strong> /profile/privacy → "ข้อมูลที่ระบบรู้
            เกี่ยวกับคุณ"
          </li>
          <li>
            <strong>แก้ไข:</strong> /profile/edit
          </li>
          <li>
            <strong>ลบประวัติพฤติกรรม:</strong> /profile/privacy → ปุ่ม
            "ลบประวัติพฤติกรรม"
          </li>
          <li>
            <strong>ลบบัญชีถาวร:</strong> /profile/privacy → "ลบบัญชี" (มี
            ระยะรอ 30 วันให้ยกเลิก)
          </li>
          <li>
            <strong>ถอนความยินยอม:</strong> ปิด toggle ในหน้า /profile/privacy
            ทุกเมื่อ
          </li>
          <li>
            <strong>ร้องเรียน:</strong> ส่งอีเมลถึง{' '}
            <a href="mailto:privacy@np.app" className="text-brand underline">
              privacy@np.app
            </a>{' '}
            — ตอบกลับภายใน 30 วัน
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">6. เก็บข้อมูลนานแค่ไหน</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>
            <strong>ข้อมูลบัญชี:</strong> จนกว่าคุณจะลบบัญชี
          </li>
          <li>
            <strong>ออเดอร์ + ใบกำกับภาษี:</strong> 5 ปี (กฎหมายภาษี) แม้
            ลบบัญชีแล้วเราจะ anonymise ข้อมูลส่วนตัวออก
          </li>
          <li>
            <strong>ประวัติพฤติกรรม:</strong> 180 วัน (ค่าเริ่มต้น) —
            ปรับเหลือ 30/90 หรือยืดถึง 730 ได้
          </li>
          <li>
            <strong>Crash log:</strong> 90 วัน
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">7. เด็กอายุต่ำกว่า 13</h2>
        <p className="text-sm leading-relaxed">
          NP Commerce ไม่ได้ออกแบบมาสำหรับเด็กอายุต่ำกว่า 13 ปี
          ถ้าผู้ปกครองพบว่าเด็กในความดูแลของท่านลงทะเบียนใช้งาน
          กรุณาติดต่อเราที่ <a href="mailto:privacy@np.app" className="text-brand underline">
            privacy@np.app
          </a>{' '}
          เพื่อลบบัญชี
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">8. การติดตามข้ามแอป (iOS)</h2>
        <p className="text-sm leading-relaxed">
          NP Commerce ไม่ติดตามคุณข้ามแอปอื่นและไม่แชร์ข้อมูลกับโฆษณา
          คุณจะเห็นป๊อปอัป "อนุญาตให้ติดตามไหม" ของ Apple ครั้งแรก —
          จะกด "ไม่ให้" ก็ได้ ไม่กระทบฟังก์ชันใด
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">9. การเปลี่ยนแปลงนโยบาย</h2>
        <p className="text-sm leading-relaxed">
          เมื่อมีการเปลี่ยนสำคัญ เราจะแจ้งให้ทราบในแอปอย่างน้อย 7 วันก่อน
          มีผลบังคับ การใช้แอปต่อหลังจากนั้นถือเป็นการยอมรับเวอร์ชันใหม่
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">10. ติดต่อเรา</h2>
        <address className="not-italic text-sm leading-relaxed">
          NP Co., Ltd.
          <br />
          เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO)
          <br />
          อีเมล:{' '}
          <a href="mailto:privacy@np.app" className="text-brand underline">
            privacy@np.app
          </a>
        </address>
      </section>

      <footer className="border-t border-ink-100 pt-4 text-xs text-ink-500">
        <Link href="/legal/terms" className="text-brand hover:underline">
          ข้อกำหนดการใช้งาน
        </Link>{' '}
        · <Link href="/" className="text-brand hover:underline">
          กลับ NP Commerce
        </Link>
      </footer>
    </main>
  );
}
