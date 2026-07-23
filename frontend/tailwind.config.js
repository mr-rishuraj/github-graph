/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // GitHub dark palette
        canvas: {
          DEFAULT: '#0d1117',
          subtle: '#161b22',
          inset: '#010409',
        },
        border: {
          DEFAULT: '#30363d',
          muted: '#21262d',
          subtle: '#6e7681',
        },
        fg: {
          DEFAULT: '#e6edf3',
          muted: '#8b949e',
          subtle: '#6e7681',
          onEmphasis: '#ffffff',
        },
        accent: {
          DEFAULT: '#388bfd',
          muted: '#1f6feb',
          subtle: '#388bfd1a',
        },
        // Node type colors
        node: {
          page: '#3b82f6',
          component: '#10b981',
          hook: '#8b5cf6',
          context: '#f59e0b',
          utility: '#6b7280',
          api: '#ef4444',
          style: '#ec4899',
          asset: '#eab308',
          config: '#94a3b8',
          test: '#6b7280',
          layout: '#06b6d4',
          unknown: '#4b5563',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Noto Sans', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideIn: {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(56, 139, 253, 0)' },
          '50%': { boxShadow: '0 0 0 4px rgba(56, 139, 253, 0.3)' },
        },
      },
    },
  },
  plugins: [],
};
