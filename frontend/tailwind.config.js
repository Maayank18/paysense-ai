/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Paytm Official Palette ──────────────────────────────────────
        paytm: {
          blue: '#00BAF2',       // Primary brand blue
          'blue-dark': '#0098CC', // Hover/active
          'blue-light': '#E6F8FE', // Light bg tint
          navy: '#002970',        // Dark navy (icon fills)
          'navy-2': '#003580',    // Slightly lighter navy
        },
        // ── Semantic ──────────────────────────────────────────────────
        surface: '#F4F6F9',      // App background
        'surface-card': '#FFFFFF',
        // ── Status ────────────────────────────────────────────────────
        success: '#00C853',
        'success-light': '#E8F9EE',
        danger: '#FF3D3D',
        'danger-light': '#FFF0F0',
        warning: '#FF8C00',
        'warning-light': '#FFF3E0',
        // ── Guardian module ────────────────────────────────────────────
        guardian: {
          safe: '#00C853',
          warn: '#FF8C00',
          block: '#FF3D3D',
        },
        // ── ScoreUp module ─────────────────────────────────────────────
        score: {
          gold: '#F5C842',
          silver: '#A8B4C0',
          bronze: '#CD7F32',
        },
        // ── Text ──────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#1A1A2E',
          2: '#4A4A68',
          3: '#8A8AA8',
          4: '#C4C4DC',
        },
      },
      fontFamily: {
        // DM Sans — closest free alternative to Paytm's custom sans
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.10)',
        'bottom-nav': '0 -2px 16px rgba(0,0,0,0.08)',
        guardian: '0 4px 24px rgba(0,186,242,0.25)',
        'guardian-warn': '0 4px 24px rgba(255,140,0,0.30)',
        'guardian-block': '0 4px 24px rgba(255,61,61,0.30)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(100%)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.97)' },
        },
        'ring-fill': {
          '0%': { strokeDashoffset: '283' },
          '100%': { strokeDashoffset: 'var(--dash-offset)' },
        },
        'waveform': {
          '0%, 100%': { scaleY: '0.4' },
          '50%': { scaleY: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'bounce-in': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '70%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        streak: {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '25%': { transform: 'rotate(-10deg) scale(1.1)' },
          '75%': { transform: 'rotate(10deg) scale(1.1)' },
          '100%': { transform: 'rotate(0deg) scale(1)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-down': 'slide-down 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 0.2s ease',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)',
        'ring-fill': 'ring-fill 1.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'waveform-1': 'waveform 0.9s ease-in-out infinite',
        'waveform-2': 'waveform 0.9s ease-in-out infinite 0.15s',
        'waveform-3': 'waveform 0.9s ease-in-out infinite 0.3s',
        'waveform-4': 'waveform 0.9s ease-in-out infinite 0.45s',
        'waveform-5': 'waveform 0.9s ease-in-out infinite 0.6s',
        shimmer: 'shimmer 1.8s linear infinite',
        'bounce-in': 'bounce-in 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        streak: 'streak 0.5s ease-in-out',
      },
    },
  },
  plugins: [],
};
