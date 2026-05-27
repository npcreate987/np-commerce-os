import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import { IBM_Plex_Sans_Thai, Anuphan } from 'next/font/google';
import { QueryProvider } from '@/lib/query-provider';
import { InstallPrompt } from '@/components/install-prompt';
import { ThemeProvider } from '@/components/theme-provider';
import { THEME_NO_FLASH_SCRIPT } from '@/lib/theme';
import './globals.css';

// === FONT STRATEGY ===========================================================
// Body: IBM Plex Sans Thai — sans-loop (ไม่มีหู) คม ทันสมัย จับคู่กับ Latin ได้ดี
//       ใช้ทุกเนื้อหา · weight 400/500/600/700
// Display: Anuphan — Thai display ที่หนาและคม เหมาะกับ hero, heading
//       ใช้ผ่านคลาส `font-display` weight 500/600/700/800
// ทั้งคู่โหลดจาก Google Fonts (cache อัตโนมัติผ่าน next/font · ไม่ต้อง preconnect)
// =============================================================================

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
});

const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
});

export const metadata: Metadata = {
  title: { default: 'NP Commerce', template: '%s · NP Commerce' },
  description: 'ระบบ Commerce กลางสำหรับร้านค้าออนไลน์ ร้านท้องถิ่น และ Creator',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NP Commerce',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#FF3E5C',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html
      lang="th"
      className={`${plexThai.variable} ${anuphan.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* No-flash theme bootstrap — must run before React hydrates */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }}
          suppressHydrationWarning
        />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <QueryProvider>
            {children}
            <InstallPrompt />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
