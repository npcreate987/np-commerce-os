import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development' || process.env.DISABLE_PWA === 'true',
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const isStatic = process.env.BUILD_STATIC === 'true';

const nextConfig = {
  reactStrictMode: true,
  // Disable ESLint during `next build` — lint errors should be caught by
  // a dedicated CI lint step, not block production image builds.
  eslint: { ignoreDuringBuilds: true },
  // BUILD_STATIC=true → output: 'export' สำหรับ Capacitor (bundle ลง iOS/Android)
  // Phase 16.x — ก่อน static export จะสำเร็จเต็มรูปแบบ ต้อง refactor
  // (creator)/layout.tsx, (rider)/layout.tsx ฯลฯ ให้เป็น server component
  // (ตอนนี้เป็น `'use client'` ทำให้ Next 14.2 ไม่ pick generateStaticParams
  // ใน dynamic child page) ปัจจุบัน Capacitor ดึง assets จาก `out/` (PWA
  // มี service worker เก็บไว้ระหว่าง dev) หรือใช้ remote URL ตอน dev mode
  ...(isStatic
    ? {
        output: 'export',
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    typedRoutes: false,
    // Phase 13.1b — Required in Next.js 14 so `instrumentation.ts` is invoked
    // at server bootstrap. Becomes default in Next.js 15+.
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  transpilePackages: ['@np/types'],
  // Universal Links (iOS) + App Links (Android) require these well-known
  // files to be served as application/json. Production web (SSR mode)
  // uses these headers; BUILD_STATIC=true skips headers() but that's
  // OK because static export bundle is for Capacitor (not web).
  async headers() {
    if (isStatic) return [];
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'content-type', value: 'application/json' }],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'content-type', value: 'application/json' }],
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/.pnpm-store/**',
          '**/.pnpm-cache/**',
          '**/.pnpm-state/**',
          '**/.pnpm-global/**',
          '**/.npm-cache/**',
          '**/.cache/**',
          '**/tmp/**',
        ],
      };
    }
    return config;
  },
};

export default withPWA(nextConfig);
