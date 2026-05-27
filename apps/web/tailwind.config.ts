import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF3E5C',
          50: '#FFF5F7',
          100: '#FFE2E7',
          200: '#FFC1CC',
          300: '#FF94A8',
          400: '#FF6A85',
          500: '#FF3E5C',
          600: '#E62E4A',
          700: '#BF2440',
          800: '#8F1B30',
          900: '#5C1220',
        },
        ink: {
          DEFAULT: '#0A0B14',
          50: '#F6F7FB',
          100: '#EEF0F6',
          200: '#DCE0EB',
          300: '#B0B7C9',
          400: '#737B92',
          500: '#4B5570',
          600: '#2F3650',
          700: '#1B2038',
          800: '#10142A',
          900: '#0A0B14',
        },
        accent: {
          violet: '#7C5CFF',
          cyan: '#22D3EE',
          amber: '#F59E0B',
          lime: '#A3E635',
        },
      },
      fontFamily: {
        // Body — IBM Plex Sans Thai (sans-loop)
        sans: [
          'var(--font-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        // Headings — Anuphan (bolder Thai display)
        display: [
          'var(--font-display)',
          'var(--font-sans)',
          '"SF Pro Display"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Inter',
          'sans-serif',
        ],
      },
      letterSpacing: {
        // Slightly loose for Thai display (was -0.04em — too tight for Thai vowels/tone marks)
        tightest: '-0.025em',
      },
      maxWidth: {
        mobile: '480px',
        app: '1280px',
      },
      screens: {
        xs: '380px',
        '2xl': '1440px',
      },
      height: {
        'topbar-d': '64px',
        'topbar-m': '56px',
        'bottomnav-m': '40px',
      },
      zIndex: {
        // Immersive content (e.g. /feed video reel) sits below chrome so the
        // bottom nav + top bar remain interactive on top.
        immersive: '30',
        topbar: '40',
        bottomnav: '40',
        sheet: '50',
        toast: '60',
        modal: '70',
      },
      borderRadius: {
        '4xl': '28px',
        '5xl': '36px',
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(135deg, #FF3E5C 0%, #FF6A85 45%, #FF94A8 100%)',
        'brand-soft': 'linear-gradient(180deg, #FFF5F7 0%, #FFFFFF 100%)',
        'hero-glow':
          'radial-gradient(60% 50% at 50% 0%, rgba(255, 62, 92, 0.35), rgba(255, 62, 92, 0) 70%)',
        'mesh-1':
          'radial-gradient(at 0% 0%, rgba(255, 62, 92, 0.45) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(124, 92, 255, 0.40) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(34, 211, 238, 0.30) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(255, 106, 133, 0.40) 0px, transparent 50%)',
        'mesh-2':
          'radial-gradient(at 20% 10%, rgba(124, 92, 255, 0.45) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(255, 62, 92, 0.45) 0px, transparent 45%), radial-gradient(at 50% 100%, rgba(34, 211, 238, 0.35) 0px, transparent 50%)',
        'mesh-dark':
          'radial-gradient(at 0% 0%, rgba(255, 62, 92, 0.55) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(124, 92, 255, 0.55) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(34, 211, 238, 0.35) 0px, transparent 50%)',
        'grid-faint':
          'linear-gradient(rgba(15, 20, 33, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 20, 33, 0.04) 1px, transparent 1px)',
        noise:
          "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        'shine':
          'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)',
      },
      backgroundSize: {
        grid: '32px 32px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(10, 11, 20, 0.06), 0 1px 2px rgba(10, 11, 20, 0.04)',
        soft: '0 8px 24px -8px rgba(10, 11, 20, 0.10)',
        glow: '0 16px 40px -12px rgba(255, 62, 92, 0.50)',
        'glow-violet': '0 16px 40px -12px rgba(124, 92, 255, 0.50)',
        pop: '0 24px 48px -16px rgba(10, 11, 20, 0.22)',
        glass:
          'inset 0 1px 0 0 rgba(255,255,255,0.45), inset 0 -1px 0 0 rgba(255,255,255,0.10), 0 8px 32px -8px rgba(10, 11, 20, 0.18)',
        'glass-dark':
          'inset 0 1px 0 0 rgba(255,255,255,0.10), 0 16px 40px -8px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 300ms ease-out',
        'slide-up': 'slideUp 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-in': 'popIn 280ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.4s linear infinite',
        'gradient-x': 'gradientX 6s ease infinite',
        float: 'float 6s ease-in-out infinite',
        'spin-slow': 'spin 18s linear infinite',
        marquee: 'marquee 30s linear infinite',
        'shine': 'shine 2s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        popIn: {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        gradientX: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shine: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 62, 92, 0.5)' },
          '50%': { boxShadow: '0 0 0 12px rgba(255, 62, 92, 0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
