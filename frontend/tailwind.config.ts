import type { Config } from 'tailwindcss';

/**
 * All theme colours are CSS-variable driven so the single
 * @media (prefers-color-scheme: dark) block in index.css
 * inverts the entire palette without touching any JSX.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF1840',
          50:  'rgba(255,24,64,0.07)',
          100: 'rgba(255,24,64,0.13)',
          200: 'rgba(255,24,64,0.30)',
          500: '#E5123A',
          600: '#FF1840',
          700: '#D00F31',
          900: '#7A0A1E',
        },
        accent: { DEFAULT: '#FF1840', 600: '#E5123A' },
        // the first (entry / loader) page only
        loader: { DEFAULT: '#0F766E', 500: '#14A89B', 700: '#0B5F58', 900: '#06302D' },

        /* ── CSS-variable tokens: light/dark auto-flip ── */
        cream:   'var(--c-cream)',
        app:     'var(--c-app)',
        card:    'var(--c-card)',
        surface: {
          DEFAULT: 'var(--c-surface)',
          tint:    'var(--c-surface-tint)',
          muted:   'var(--c-surface-muted)',
        },
        ink: {
          DEFAULT: 'var(--c-ink)',
          soft:    'var(--c-ink-soft)',
        },

        seat: {
          free:   'var(--c-ink)',
          booked: 'var(--c-ink)',
          wait:   '#DC2626',
          held:   '#B8860B',
          ladies: '#DB2777',
        },

        /* explicit white/black that never change */
        white: '#ffffff',
        black: '#000000',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans Tamil"', '"Noto Sans Malayalam"', '"Noto Sans Kannada"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem' },
      boxShadow: {
        card: '0 1px 0 rgba(0,0,0,0.04), 0 10px 28px rgba(0,0,0,0.07)',
        lift: '0 2px 0 rgba(0,0,0,0.04), 0 18px 44px rgba(0,0,0,0.14)',
        cta:  '0 8px 20px rgba(255,24,64,0.28)',
        glow: '0 8px 22px rgba(255,24,64,0.22)',
      },
      keyframes: {
        kenburns: { '0%': { transform: 'scale(1)' },   '100%': { transform: 'scale(1.15)' } },
        fadeUp:   { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'none' } },
        fade:     { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeOut:  { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
        dialogIn: { '0%': { opacity: '0', transform: 'translateY(18px) scale(.92)' }, '60%': { opacity: '1', transform: 'translateY(-3px) scale(1.012)' }, '100%': { opacity: '1', transform: 'none' } },
        dialogOut:{ '0%': { opacity: '1', transform: 'none' }, '100%': { opacity: '0', transform: 'translateY(10px) scale(.96)' } },
        sheetOut: { '0%': { transform: 'none' }, '100%': { transform: 'translateY(100%)' } },
        pop:      { '0%': { opacity: '0', transform: 'scale(.94)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        sheet:    { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
        pulse2:   { '0%,100%': { opacity: '1' }, '50%': { opacity: '.45' } },
        dash:     { to: { strokeDashoffset: '-24' } },
        bob:      { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-4px)' } },
        ping2:    { '0%': { transform: 'scale(1)', opacity: '.55' }, '100%': { transform: 'scale(2)', opacity: '0' } },
        orbit:    { to: { transform: 'rotate(360deg)' } },
        scan:     { '0%': { top: '4%' }, '50%': { top: '92%' }, '100%': { top: '4%' } },
        tick:     { '0%': { transform: 'scale(0)' }, '60%': { transform: 'scale(1.18)' }, '100%': { transform: 'scale(1)' } },
        drive:    { '0%': { transform: 'translateX(-30%)' }, '100%': { transform: 'translateX(130%)' } },
        road:     { to: { backgroundPositionX: '-24px' } },
        hop:      { '0%,80%,100%': { transform: 'translateY(0)' }, '40%': { transform: 'translateY(-8px)' } },
        bar:      { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(250%)' } },
        seatpop:  { '0%': { transform: 'scale(.85)' }, '55%': { transform: 'scale(1.18)' }, '100%': { transform: 'scale(1.08)' } },
        payRipple: { '0%': { transform: 'scale(0)', opacity: '0.85' }, '100%': { transform: 'scale(3.5)', opacity: '0' } },
        payCheck:  { '0%': { strokeDashoffset: '60' }, '100%': { strokeDashoffset: '0' } },
        payCheckBg:{ '0%': { transform: 'scale(0)', opacity: '0' }, '50%': { transform: 'scale(1.2)', opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        payFadeUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        payError:  { '0%': { transform: 'scale(0)', opacity: '0' }, '55%': { transform: 'scale(1.15)', opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        payLoader: { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        payPulse:  { '0%,100%': { transform: 'scale(1)', opacity: '.7' }, '50%': { transform: 'scale(1.08)', opacity: '1' } },
      },
      animation: {
        kenburns: 'kenburns 12s ease-out forwards',
        fadeUp:   'fadeUp .4s cubic-bezier(.2,.8,.2,1) both',
        fade:     'fade .25s ease-out both',
        fadeOut:  'fadeOut .2s ease-in both',
        dialogIn: 'dialogIn .38s cubic-bezier(.2,.9,.3,1) both',
        dialogOut:'dialogOut .2s ease-in both',
        sheetOut: 'sheetOut .22s ease-in both',
        pop:      'pop .24s ease-out both',
        sheet:    'sheet .4s cubic-bezier(.16,1,.3,1) both',
        pulse2:   'pulse2 1.3s ease-in-out infinite',
        dash:     'dash 1s linear infinite',
        bob:      'bob 1.1s ease-in-out infinite',
        ping2:    'ping2 1.5s ease-out infinite',
        orbit:    'orbit 2.2s linear infinite',
        scan:     'scan 2.2s ease-in-out infinite',
        tick:     'tick .45s ease-out both',
        drive:    'drive 1.6s ease-in-out infinite',
        road:     'road .5s linear infinite',
        hop:      'hop 1s ease-in-out infinite',
        bar:      'bar 1.1s ease-in-out infinite',
        seatpop:  'seatpop .3s ease-out both',
        payRipple: 'payRipple 0.7s ease-out forwards',
        payCheck:  'payCheck 0.5s ease-out 0.3s forwards',
        payCheckBg:'payCheckBg 0.45s cubic-bezier(.2,.9,.3,1) both',
        payFadeUp: 'payFadeUp 0.4s ease-out both',
        payError:  'payError 0.45s cubic-bezier(.2,.9,.3,1) both',
        payLoader: 'payLoader 0.8s linear infinite',
        payPulse:  'payPulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
