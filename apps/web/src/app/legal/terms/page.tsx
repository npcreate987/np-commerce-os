/**
 * Phase 17 — Terms of Service (public).
 *
 * Required by App Store Connect's "EULA" field if you don't use Apple's
 * default. Also required for Play Store listing. Reachable from
 * `/profile` and footer.
 *
 * URL: `/legal/terms` (production: https://np.app/legal/terms)
 */

import Link from 'next/link';

export const metadata = {
  title: 'ข้อกำหนดการใช้งาน · TuKTuK',
  description:
    'ข้อกำหนดการใช้งาน TuKTuK — สิทธิ หน้าที่ และข้อจำกัดของผู้ใช้และผู้ขาย',
};

export default function TermsPage(): JSX.Element {
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
          ข้อกำหนดการใช้งาน
        </h1>
        <p className="mt-1 text-xs text-ink-500">
          มีผลบังคับใช้: 24 พฤษภาคม 2026 · เวอร์ชัน 1.0
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">1. ยอมรับข้อกำหนด</h2>
        <p className="text-sm leading-relaxed">
          การสมัครหรือใช้แอป TuKTuK (เว็บ + iOS + Android) ถือว่าคุณ
          ตกลงตามข้อกำหนดในเอกสารฉบับนี้และนโยบายความเป็นส่วนตัวที่{' '}
          <Link href="/legal/privacy" className="text-brand underline">
            /legal/privacy
          </Link>{' '}
          ถ้าไม่ยอมรับ กรุณาหยุดใช้บริการ
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">2. คุณสมบัติของผู้ใช้</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>อายุ 13 ปีขึ้นไป (อายุน้อยกว่า 20 ต้องได้รับความยินยอมจากผู้ปกครอง)</li>
          <li>ให้ข้อมูลที่ถูกต้อง ครบถ้วน เป็นจริง</li>
          <li>ดูแลรหัสผ่านไม่ให้ผู้อื่นรู้</li>
          <li>ใช้บัญชี 1 บัญชีต่อ 1 คน — ห้ามขายต่อหรือโอน</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">3. สำหรับลูกค้า</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>สินค้า/ราคา/รายละเอียดที่เห็นในแอปเป็นข้อมูลที่ผู้ขายโพสต์ NP เป็นเพียงตลาดกลาง</li>
          <li>การชำระเงินผ่านระบบที่ NP กำหนด การจ่ายนอกช่องทางถือว่าคุณรับความเสี่ยงเอง</li>
          <li>การคืนสินค้า/เงิน ทำได้ตามนโยบายร้านค้านั้น ๆ ที่ระบุในหน้าสินค้า/ออเดอร์</li>
          <li>กรณีพิพาท เปิด "ขอความช่วยเหลือ" จากหน้าออเดอร์ NP จะตัดสินใจหลัง 7 วัน</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">4. สำหรับผู้ขาย (Merchant)</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>ต้องเป็นนิติบุคคล/บุคคลที่ขายของได้ตามกฎหมายไทย</li>
          <li>รับผิดชอบคุณภาพ ความปลอดภัย และการจัดส่งของสินค้าตามที่โพสต์</li>
          <li>ห้ามโพสต์สินค้าผิดกฎหมาย/ลิขสิทธิ์/ของลอกเลียน/สินค้าควบคุม (ยา บุหรี่ ฯลฯ)</li>
          <li>NP เก็บค่าธรรมเนียมตามอัตราที่ประกาศ คำนวณจากยอดออเดอร์สำเร็จ</li>
          <li>NP มีสิทธิ์ระงับร้านที่ละเมิดข้อกำหนด</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">5. สำหรับ Rider (ผู้ส่ง)</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>ต้องมีใบขับขี่ที่ใช้ได้ + ประกันรถยนต์/มอเตอร์ไซค์</li>
          <li>NP รับสมัคร Rider เป็น independent contractor ไม่ใช่ลูกจ้าง</li>
          <li>ค่าจัดส่งและทิปจ่ายตามอัตราที่ระบบคำนวณ จ่ายผ่านวอลเลตในแอป</li>
          <li>การยกเลิกงานต่อเนื่องโดยไม่มีเหตุผลจะถูกระงับชั่วคราว</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">6. เนื้อหาที่ผู้ใช้อัปโหลด</h2>
        <ul className="ml-5 list-disc space-y-2 text-sm leading-relaxed">
          <li>คุณยังเป็นเจ้าของลิขสิทธิ์เนื้อหา (วิดีโอฟีด รีวิว รูปสินค้า)</li>
          <li>แต่ให้สิทธิ์ NP ใช้/แสดง/ทำสำเนาภายในแพลตฟอร์มได้</li>
          <li>ห้ามโพสต์เนื้อหาผิดกฎหมาย ลามก หมิ่นประมาท ละเมิดลิขสิทธิ์</li>
          <li>NP มีสิทธิ์ลบเนื้อหาที่ละเมิดและระงับบัญชีโดยไม่ต้องแจ้งล่วงหน้า</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">7. การยกเลิกบัญชี</h2>
        <p className="text-sm leading-relaxed">
          คุณยกเลิกบัญชีได้จาก{' '}
          <Link
            href="/profile/privacy"
            className="text-brand underline"
          >
            /profile/privacy → "ลบบัญชี"
          </Link>{' '}
          หลังกดยืนยันมีระยะรอ 30 วันให้ยกเลิกได้ก่อนข้อมูลถูกลบถาวร NP
          สงวนสิทธิ์ระงับบัญชีที่ละเมิดข้อกำหนดโดยไม่ต้องแจ้งล่วงหน้า
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">8. ข้อจำกัดความรับผิด</h2>
        <p className="text-sm leading-relaxed">
          NP ให้บริการ "as-is" ไม่รับประกันว่าใช้งานได้ตลอดเวลาหรือ
          ปราศจากข้อผิดพลาด ความเสียหายที่เกิดจากการใช้บริการ (เช่น
          downtime ระบบ ข้อมูลสูญหายในเหตุสุดวิสัย) NP จะรับผิดไม่เกินยอด
          ค่าธรรมเนียมที่คุณจ่ายมาในรอบ 3 เดือนล่าสุด
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">9. กฎหมายและศาลที่ใช้</h2>
        <p className="text-sm leading-relaxed">
          เอกสารนี้อยู่ภายใต้กฎหมายไทย ข้อพิพาทใด ๆ จะส่งให้ศาลแขวงในกรุงเทพ
          มหานครเป็นศาลที่มีเขตอำนาจตัดสิน
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">10. การติดต่อ</h2>
        <address className="not-italic text-sm leading-relaxed">
          NP Co., Ltd.
          <br />
          อีเมล:{' '}
          <a href="mailto:support@np.app" className="text-brand underline">
            support@np.app
          </a>{' '}
          (เรื่องทั่วไป){' '}
          ·{' '}
          <a href="mailto:legal@np.app" className="text-brand underline">
            legal@np.app
          </a>{' '}
          (เรื่องกฎหมาย)
        </address>
      </section>

      <footer className="border-t border-ink-100 pt-4 text-xs text-ink-500">
        <Link href="/legal/privacy" className="text-brand hover:underline">
          นโยบายความเป็นส่วนตัว
        </Link>{' '}
        ·{' '}
        <Link href="/" className="text-brand hover:underline">
          กลับ TuKTuK
        </Link>
      </footer>
    </main>
  );
}
