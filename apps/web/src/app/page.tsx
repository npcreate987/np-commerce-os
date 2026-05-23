import Link from 'next/link';
import {
  ArrowRightIcon,
  HeartIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StoreIcon,
  TruckIcon,
} from '@/components/icons';
import { Orb } from '@/components/ui/glass';
import { ThemeToggle } from '@/components/shell/theme-toggle';

const marqueeWords = [
  'Flash Deal',
  'Local Delivery',
  'NP Protect',
  'Live Shopping',
  'AI Recommend',
  'Creator Drop',
  'Same Day',
  'Cashback',
  'Phase 1 · MVP',
];

const desktopFeatures = [
  {
    Icon: ShieldCheckIcon,
    title: 'NP Protect',
    desc: 'เงินถูกพักจนของถึงมือ · คืน 100% ถ้าไม่ตรงปก',
    accent: 'from-brand to-fuchsia-500',
  },
  {
    Icon: TruckIcon,
    title: 'เลือกขนส่งเอง',
    desc: 'Flash · Kerry · J&T · Lalamove · NP Rider — ไม่ผูกขาด',
    accent: 'from-accent-cyan to-sky-500',
  },
  {
    Icon: SparklesIcon,
    title: 'AI ที่อธิบายได้',
    desc: 'แนะนำตรงรสนิยม · เห็น signal · ปรับแต่ง opt-out ได้',
    accent: 'from-accent-violet to-indigo-500',
  },
  {
    Icon: StoreIcon,
    title: 'ขายได้ทั้งออนไลน์ + Local',
    desc: 'เปิดร้านในมือถือ · เมนู slot booking · Rider จัดส่งใกล้ตัว',
    accent: 'from-emerald-500 to-teal-600',
  },
];

export default function HomePage(): JSX.Element {
  return (
    <main className="bg-surface text-surface-strong relative min-h-dvh overflow-hidden">
      {/* === BACKDROP === */}
      <div className="absolute inset-0 -z-10 bg-mesh-soft" aria-hidden />
      <Orb className="left-[-40px] top-[-40px] h-72 w-72 bg-brand/45 lg:h-[480px] lg:w-[480px]" />
      <Orb
        className="right-[-60px] top-32 h-80 w-80 bg-accent-violet/45 lg:right-[10%] lg:h-96 lg:w-96"
        style={{ animationDelay: '-2s' }}
      />
      <Orb
        className="left-1/2 top-[420px] h-72 w-72 -translate-x-1/2 bg-accent-cyan/30 lg:hidden"
        style={{ animationDelay: '-4s' }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint bg-grid opacity-50 mask-fade-b" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-noise opacity-[0.18] mix-blend-overlay" />

      {/* ============================================
          MOBILE LAYOUT (default, hidden on lg+)
          ============================================ */}
      <div className="lg:hidden">
        {/* Top bar */}
        <header
          className="container-mobile relative flex items-center justify-between pt-5"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 20px)' }}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
              <span className="absolute inset-0 rounded-2xl bg-noise opacity-30 mix-blend-overlay" aria-hidden />
              <SparklesIcon className="relative h-5 w-5" />
            </div>
            <span className="font-display text-sm font-bold tracking-tight">NP Commerce</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="glass rounded-full px-4 py-1.5 text-xs font-semibold text-surface-strong"
            >
              เข้าสู่ระบบ
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="container-mobile relative pt-10 text-center">
          <div className="animate-pop-in inline-flex items-center gap-1.5 rounded-full bg-surface-raised/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700 shadow-card backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            Phase 10 · Personalised
          </div>

          <h1 className="animate-slide-up mt-5 font-display text-[40px] font-bold leading-[1.05] tracking-tightest text-surface-strong [text-wrap:balance]">
            ร้านเป็นเจ้าของ
            <br />
            <span className="text-gradient">การขาย</span>
            <br />
            ลูกค้าซื้อมั่นใจ
          </h1>
          <p
            className="animate-slide-up mx-auto mt-4 max-w-sm text-pretty text-[14px] leading-relaxed text-surface-muted"
            style={{ animationDelay: '60ms' }}
          >
            ใช้ TikTok ดึงลูกค้า แต่ปิดการขาย เก็บ Data ขนส่ง การตลาด
            <br /> ในระบบเดียวที่เป็นของคุณ
          </p>

          <div className="animate-slide-up mt-7 flex flex-col items-stretch gap-3" style={{ animationDelay: '120ms' }}>
            <Link
              href="/feed"
              className="shine-on-hover group relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand-gradient text-[15px] font-semibold text-white shadow-glow transition active:scale-[0.985]"
            >
              <span className="absolute inset-0 bg-noise opacity-25 mix-blend-overlay" aria-hidden />
              <span className="relative">เริ่มช้อปปิ้ง</span>
              <ArrowRightIcon className="relative h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/merchant/dashboard"
              className="glass-strong inline-flex h-14 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-surface-strong transition active:scale-[0.985]"
            >
              <StoreIcon className="h-4 w-4" />
              เข้าหน้าร้านค้า
            </Link>
          </div>

          <div className="animate-slide-up mt-8 grid grid-cols-3 gap-2" style={{ animationDelay: '180ms' }}>
            <Stat label="ร้านค้า" value="1,200+" />
            <Stat label="สินค้า" value="40K+" />
            <Stat label="ค่า GMV" value="฿15M" />
          </div>
        </section>

        {/* Marquee */}
        <section className="relative mt-12 overflow-hidden border-y border-ink-100 bg-ink-900/95 py-4 noise">
          <div className="marquee-row gap-8 pr-8">
            {[...marqueeWords, ...marqueeWords].map((w, i) => (
              <span
                key={i}
                className="flex shrink-0 items-center gap-3 font-display text-2xl font-semibold tracking-tightest text-white"
              >
                {w}
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
            ))}
          </div>
        </section>

        {/* Mobile features bento */}
        <section className="container-mobile relative mt-10">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-surface-faint">
            ✦ Modules
          </h2>
          <h3 className="mt-1 font-display text-2xl font-bold tracking-tightest text-surface-strong">
            ทุกอย่างของ commerce<br />ในแอปเดียว
          </h3>

          <div className="mt-5 grid grid-cols-6 gap-3">
            <div className="col-span-6 relative overflow-hidden rounded-3xl bg-ink-900 p-5 text-white shadow-pop noise">
              <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-brand/40 blur-3xl" />
              <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-accent-violet/40 blur-3xl" />
              <div className="relative">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
                  <ShieldCheckIcon className="h-5 w-5" />
                </div>
                <h4 className="mt-4 font-display text-xl font-bold tracking-tightest">NP Protect</h4>
                <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-ink-300">
                  เงินถูกพักจนลูกค้าได้รับของจริง · คืนเงิน 100% หากไม่ตรงปก
                </p>
              </div>
            </div>

            <div className="col-span-3 relative overflow-hidden rounded-3xl bg-surface-raised p-4 ring-1 ring-surface shadow-card">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-violet/10 text-accent-violet">
                <TruckIcon className="h-4 w-4" />
              </div>
              <p className="mt-3 font-display text-base font-bold tracking-tight text-surface-strong">Logistics</p>
              <p className="mt-0.5 text-[11px] leading-snug text-surface-muted">เลือกขนส่งเอง · Tracking รวม</p>
            </div>
            <div className="col-span-3 relative overflow-hidden rounded-3xl bg-surface-raised p-4 ring-1 ring-surface shadow-card">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent-cyan/15 text-cyan-600">
                <SparklesIcon className="h-4 w-4" />
              </div>
              <p className="mt-3 font-display text-base font-bold tracking-tight text-surface-strong">AI Engine</p>
              <p className="mt-0.5 text-[11px] leading-snug text-surface-muted">แนะนำสินค้า · วิเคราะห์ร้าน</p>
            </div>
          </div>
        </section>

        <section className="container-mobile relative mt-12 pb-16">
          <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 p-6 text-white shadow-pop noise">
            <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand/40 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-accent-violet/40 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-200 ring-1 ring-white/15">
                For merchants
              </span>
              <h3 className="mt-3 font-display text-2xl font-bold tracking-tightest">
                เปิดร้านในมือถือ
                <br />
                ไม่มีค่าธรรมเนียมรายเดือน
              </h3>
              <p className="mt-2 text-[13px] text-ink-300">
                ลงสินค้า · ขาย · จัดส่ง · เก็บข้อมูลลูกค้าได้ · จ่ายเมื่อขายได้เท่านั้น
              </p>
              <Link
                href="/signup"
                className="shine-on-hover mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-ink-900 transition active:scale-[0.985]"
              >
                สมัครร้านค้าฟรี
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center text-[11px] text-surface-faint">
            © NP Commerce OS · PWA · Installable on iOS / Android
          </p>
        </section>
      </div>

      {/* ============================================
          DESKTOP LAYOUT (lg+, hidden below)
          ============================================ */}
      <div className="hidden lg:block">
        {/* Desktop top bar */}
        <header className="container-app relative flex items-center justify-between pt-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
              <span className="absolute inset-0 rounded-2xl bg-noise opacity-30 mix-blend-overlay" aria-hidden />
              <SparklesIcon className="relative h-5 w-5" />
            </div>
            <div>
              <span className="font-display text-lg font-bold tracking-tight">NP Commerce</span>
              <p className="-mt-0.5 text-[11px] font-medium text-surface-muted">
                ระบบ Commerce กลางของไทย
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <a href="#features" className="rounded-xl px-3 py-2 text-sm font-semibold text-surface-strong/80 transition hover:bg-surface-raised hover:text-surface-strong">
              ฟีเจอร์
            </a>
            <a href="#for-shops" className="rounded-xl px-3 py-2 text-sm font-semibold text-surface-strong/80 transition hover:bg-surface-raised hover:text-surface-strong">
              สำหรับร้านค้า
            </a>
            <a href="#for-creators" className="rounded-xl px-3 py-2 text-sm font-semibold text-surface-strong/80 transition hover:bg-surface-raised hover:text-surface-strong">
              Creator
            </a>
            <span className="mx-2 h-6 w-px bg-surface" />
            <ThemeToggle variant="pill" />
            <Link
              href="/login"
              className="ml-1 rounded-xl px-3 py-2 text-sm font-semibold text-surface-strong/80 transition hover:bg-surface-raised hover:text-surface-strong"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/signup"
              className="ml-1 inline-flex h-10 items-center gap-2 rounded-2xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition hover:shadow-pop active:scale-95"
            >
              เริ่มใช้ฟรี
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        {/* Hero: 2-col */}
        <section className="container-app relative grid grid-cols-12 items-center gap-10 pt-16 pb-12">
          <div className="col-span-7">
            <div className="animate-pop-in inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700 shadow-card backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
              Phase 10 · Behavioural Intelligence Live
            </div>
            <h1 className="animate-slide-up mt-6 font-display text-6xl font-bold leading-[1.02] tracking-tightest text-surface-strong [text-wrap:balance]">
              ร้านเป็นเจ้าของการขาย · <br />
              ลูกค้า <span className="text-gradient">ซื้อมั่นใจ</span> · <br />
              ระบบรู้ใจคุณ
            </h1>
            <p
              className="animate-slide-up mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-surface-muted"
              style={{ animationDelay: '60ms' }}
            >
              ใช้ TikTok ดึงลูกค้า แต่ปิดการขายในระบบของคุณ — Escrow,
              Logistics ไม่ผูกขาด, AI Personalisation ที่อธิบายได้,
              และเปิดร้าน Local Commerce พร้อม NP Rider ได้ในแพลตฟอร์มเดียว
            </p>

            <div className="animate-slide-up mt-8 flex items-center gap-3" style={{ animationDelay: '120ms' }}>
              <Link
                href="/feed"
                className="shine-on-hover group relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-brand-gradient px-7 text-base font-semibold text-white shadow-glow transition hover:shadow-pop active:scale-[0.985]"
              >
                <span className="absolute inset-0 bg-noise opacity-25 mix-blend-overlay" aria-hidden />
                <span className="relative">เริ่มช้อปปิ้ง</span>
                <ArrowRightIcon className="relative h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/merchant/dashboard"
                className="glass-strong inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold text-surface-strong transition hover:shadow-soft active:scale-[0.985]"
              >
                <StoreIcon className="h-4 w-4" />
                เข้าหน้าร้านค้า
              </Link>
            </div>

            <div className="animate-slide-up mt-10 grid max-w-2xl grid-cols-4 gap-3" style={{ animationDelay: '180ms' }}>
              <DesktopStat label="ร้านค้า" value="1,200+" />
              <DesktopStat label="สินค้า" value="40K+" />
              <DesktopStat label="GMV" value="฿15M" />
              <DesktopStat label="Rider" value="320" />
            </div>
          </div>

          {/* Right: floating product hero stack */}
          <div className="col-span-5 relative">
            <div className="relative h-[520px]">
              <div className="absolute right-0 top-0 w-72 rotate-3 rounded-3xl bg-surface-raised p-4 shadow-pop ring-1 ring-surface backdrop-blur transition hover:-translate-y-1">
                <div className="aspect-[4/5] w-full rounded-2xl bg-gradient-to-br from-brand/40 via-pink-200 to-amber-200" />
                <div className="mt-3 flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase text-surface-faint">ของแนะนำ</p>
                    <p className="font-display text-sm font-bold text-surface-strong">เสื้อยืดโอเวอร์ไซส์</p>
                  </div>
                  <span className="rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-bold text-white">
                    ฿390
                  </span>
                </div>
              </div>

              <div className="absolute left-2 top-32 w-72 -rotate-2 rounded-3xl bg-ink-900 p-4 text-white shadow-pop ring-1 ring-white/10 backdrop-blur transition hover:-translate-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                    <ShieldCheckIcon className="h-4 w-4 text-brand-200" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold tracking-tight">NP Protect</p>
                    <p className="text-[11px] text-ink-300">เงินคืน 100% ถ้าไม่ตรงปก</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-white/5 p-2 text-[11px] text-ink-200">
                  ✓ Escrow active · ✓ ขนส่ง Flash · ✓ ส่งภายใน 2 วัน
                </div>
              </div>

              <div className="absolute bottom-4 right-8 w-72 rotate-1 rounded-3xl bg-gradient-to-br from-accent-violet to-indigo-600 p-4 text-white shadow-pop transition hover:-translate-y-1">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="h-4 w-4" />
                  <p className="font-display text-sm font-bold">AI Recommend</p>
                </div>
                <p className="mt-1 text-[11px] text-white/80">
                  👀 เพราะคุณเพิ่งดู · ⭐ ร้านโปรด · 🔥 มาแรง
                </p>
                <div className="mt-3 flex gap-2">
                  <div className="h-12 w-12 rounded-xl bg-white/20" />
                  <div className="h-12 w-12 rounded-xl bg-white/20" />
                  <div className="h-12 w-12 rounded-xl bg-white/20" />
                  <div className="h-12 w-12 rounded-xl bg-white/20" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Marquee */}
        <section className="relative mt-4 overflow-hidden border-y border-surface bg-ink-900/95 py-5 noise">
          <div className="marquee-row gap-12 pr-12">
            {[...marqueeWords, ...marqueeWords].map((w, i) => (
              <span
                key={i}
                className="flex shrink-0 items-center gap-4 font-display text-3xl font-semibold tracking-tightest text-white"
              >
                {w}
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
            ))}
          </div>
        </section>

        {/* Desktop 4-col features */}
        <section id="features" className="container-app relative mt-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            ✦ Modules
          </p>
          <h2 className="mt-2 max-w-2xl font-display text-4xl font-bold tracking-tightest text-surface-strong">
            ทุกอย่างของ commerce ในระบบเดียว
          </h2>

          <div className="mt-10 grid grid-cols-4 gap-5">
            {desktopFeatures.map(({ Icon, title, desc, accent }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-3xl border border-surface bg-surface-raised p-6 shadow-card transition hover:-translate-y-1 hover:shadow-pop"
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-glow`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold tracking-tight text-surface-strong">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-surface-muted">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* For shops + For creators side-by-side */}
        <section className="container-app relative mt-20 grid grid-cols-2 gap-6">
          <div id="for-shops" className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 p-10 text-white shadow-pop noise">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/40 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-accent-violet/40 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-200 ring-1 ring-white/15">
                For merchants
              </span>
              <h3 className="mt-4 font-display text-4xl font-bold tracking-tightest">
                เปิดร้านในมือถือ
                <br />
                ไม่มีค่าธรรมเนียมรายเดือน
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-300">
                ลงสินค้า · ขาย · จัดส่ง · เก็บ Data ลูกค้าไว้เอง · ใช้ AI Insights วิเคราะห์ · จ่ายเมื่อขายได้
              </p>
              <Link
                href="/signup"
                className="shine-on-hover mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-sm font-semibold text-ink-900 transition active:scale-[0.985]"
              >
                สมัครร้านค้าฟรี
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div id="for-creators" className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand via-pink-500 to-accent-violet p-10 text-white shadow-pop noise">
            <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/30 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-white/25">
                For creators
              </span>
              <h3 className="mt-4 font-display text-4xl font-bold tracking-tightest">
                เปลี่ยน Followers
                <br />
                เป็นรายได้
              </h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85">
                สร้างลิงก์ขาย QR · ค่าคอมจ่ายอัตโนมัติจาก Escrow · Track click → conversion ครบ
              </p>
              <Link
                href="/apply-creator"
                className="shine-on-hover mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink-900 px-6 text-sm font-semibold text-white transition active:scale-[0.985]"
              >
                <HeartIcon className="h-4 w-4" />
                สมัคร Creator
              </Link>
            </div>
          </div>
        </section>

        <footer className="container-app relative mt-24 border-t border-surface pb-12 pt-8">
          <div className="flex items-center justify-between text-[12px] text-surface-faint">
            <p>© NP Commerce OS · PWA · Installable on iOS / Android</p>
            <div className="flex items-center gap-5">
              <Link href="/profile/privacy" className="hover:text-surface-strong">
                Privacy
              </Link>
              <a href="#features" className="hover:text-surface-strong">
                Features
              </a>
              <Link href="/apply-rider" className="hover:text-surface-strong">
                Rider
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="glass rounded-2xl px-2 py-2 text-center">
      <p className="font-display text-base font-bold tracking-tightest text-surface-strong">
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-surface-faint">{label}</p>
    </div>
  );
}

function DesktopStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-surface bg-surface-raised px-4 py-4 shadow-card">
      <p className="font-display text-2xl font-bold tracking-tightest text-surface-strong">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-surface-faint">{label}</p>
    </div>
  );
}
