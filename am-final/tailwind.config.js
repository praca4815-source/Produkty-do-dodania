/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Mono"', 'monospace'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
      },
      colors: {
        surface: {
          50: '#f8f7f4',
          100: '#f0ede6',
          200: '#e2ddd3',
          800: '#2a2520',
          900: '#1a1612',
          950: '#0f0d0a',
        },
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
        }
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-12px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideOut: {
          '0%': { opacity: '1', transform: 'translateX(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateX(60px) scale(0.95)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulse_soft: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(251,191,36,0.3)' },
          '50%': { boxShadow: '0 0 0 6px rgba(251,191,36,0)' },
        }
      },
      animation: {
        slideIn: 'slideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        slideOut: 'slideOut 0.22s ease-in forwards',
        fadeIn: 'fadeIn 0.4s ease forwards',
        pulse_soft: 'pulse_soft 1.6s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
