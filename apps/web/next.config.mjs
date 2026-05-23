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
  // BUILD_STATIC=true → output: 'export' สำหรับ Capacitor (bundle ลง iOS/Android)
  ...(isStatic ? { output: 'export', images: { unoptimized: true } } : {}),
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
