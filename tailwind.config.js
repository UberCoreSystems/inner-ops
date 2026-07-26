
/** @type {import('tailwindcss').Config} */
export default {
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Oura-inspired color palette
        oura: {
          bg: '#000000',
          darker: '#050505',
          card: '#0a0a0a',
          border: '#1a1a1a',
          text: '#ffffff',
          textSecondary: '#8a8a8a',
          // Score colors
          cyan: '#00d4aa',
          blue: '#4da6ff',
          purple: '#a855f7',
          amber: '#f59e0b',
          red: '#ef4444',
          green: '#22c55e',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'oura-glow-cyan': '0 0 30px rgba(0, 212, 170, 0.3)',
        'oura-glow-red': '0 0 30px rgba(239, 68, 68, 0.3)',
        'oura-glow-amber': '0 0 30px rgba(245, 158, 11, 0.3)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  safelist: [
    'duration-[4000ms]',
  ],
  plugins: [],
}
