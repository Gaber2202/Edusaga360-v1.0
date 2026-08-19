import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: '12px',
        sm: '8px',
        tile: '12px',
        card: '16px',
      },
      fontFamily: {
        sans: ['Poppins', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        arabic: ['IBM Plex Sans Arabic', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--es-shadow-card)',
        panel: 'var(--es-shadow-panel)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        forest: {
          900: '#0B3A29',
          700: '#0F5138',
          500: '#2E7D5B',
          100: '#E3F0E8',
        },
        gold: {
          DEFAULT: '#C9A227',
          400: '#C9A227',
          600: '#B08D3A',
          bright: '#D9B85C',
        },
        sand: {
          DEFAULT: 'var(--es-cream-50)',
          alt: 'var(--es-sand-100)',
        },
        ink: 'var(--es-text-primary)',
        cream: 'var(--es-cream-50)',
        najdi: {
          DEFAULT: '#0F5138',
          50: '#E3F0E8',
          100: '#E3F0E8',
          200: '#E3F0E8',
          500: '#2E7D5B',
          700: '#0F5138',
          800: '#0F5138',
          900: '#0B3A29',
        },
        'es-warn': '#D08A24',
        'es-error': '#A8443A',
        'es-success': '#2E7D5B',
      },
      transitionDuration: {
        state: '120ms',
        reveal: '240ms',
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
