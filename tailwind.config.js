
/** @type {import('tailwindcss').Config} */
export default {
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
          card: '#0a0a0a',
          cardHover: '#111111',
          border: '#1a1a1a',
          borderHover: '#2a2a2a',
          text: '#ffffff',
          textSecondary: '#8a8a8a',
          textMuted: '#5a5a5a',
          // Score colors
          cyan: '#00d4aa',
          cyanGlow: '#00d4aa33',
          blue: '#4da6ff',
          blueGlow: '#4da6ff33',
          purple: '#a855f7',
          purpleGlow: '#a855f733',
          amber: '#f59e0b',
          amberGlow: '#f59e0b33',
          red: '#ef4444',
          redGlow: '#ef444433',
          green: '#22c55e',
          greenGlow: '#22c55e33',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'oura': '20px',
        'oura-lg': '28px',
      },
      boxShadow: {
        'oura': '0 0 40px rgba(0, 212, 170, 0.1)',
        'oura-card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'oura-glow-cyan': '0 0 30px rgba(0, 212, 170, 0.3)',
        'oura-glow-blue': '0 0 30px rgba(77, 166, 255, 0.3)',
        'oura-glow-purple': '0 0 30px rgba(168, 85, 247, 0.3)',
      },
      animation: {
        'ring-pulse': 'ringPulse 2s ease-in-out infinite',
        'score-count': 'scoreCount 1s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        ringPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        scoreCount: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 212, 170, 0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 212, 170, 0.4)' },
        },
      },
    },
  },
  plugins: [],
}
