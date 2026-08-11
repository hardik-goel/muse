import type { Config } from 'tailwindcss';

/**
 * Muse design tokens. These values are the brand — do not adjust them.
 * Alpha tints are fixed at 14% per the spec and exposed as `*-tint`.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#171216',
        surface: '#211A1F',
        raised: '#2A2127',
        line: '#3A2E35',

        text: '#F1E9DE',
        soft: '#C6B8AB',
        muted: '#93857B',
        faint: '#6E6259',

        champagne: '#D8C39A',
        champDeep: '#B69B6C',

        wine: '#A05266',
        wineDeep: '#4A2230',
        wineDark: '#2E161F',

        green: '#8FB89B',
        red: '#D07A6C',
        violet: '#A995C9',

        // 14% alpha tints for chips, badges and soft fills.
        'champagne-tint': 'rgba(216, 195, 154, 0.14)',
        'wine-tint': 'rgba(160, 82, 102, 0.14)',
        'green-tint': 'rgba(143, 184, 155, 0.14)',
        'red-tint': 'rgba(208, 122, 108, 0.14)',
        'violet-tint': 'rgba(169, 149, 201, 0.14)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Instrument Serif', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'Albert Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        eyebrow: '0.16em',
      },
      borderRadius: {
        card: '24px',
        pill: '999px',
      },
      backgroundImage: {
        // The Current + Momentum share one gradient. Defined once, used twice.
        wine: 'linear-gradient(150deg, #4A2230, #2E161F)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        particle: {
          '0%': { opacity: '0', transform: 'translateY(0) scale(0.6)' },
          '20%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-120px) scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise 0.3s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
        particle: 'particle 1.4s ease-out forwards',
        fadeIn: 'fadeIn 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
