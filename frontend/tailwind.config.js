/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#070A12',
          900: '#0C1220',
          850: '#10172A',
          800: '#162035',
          750: '#1D2A44',
          700: '#253454',
          600: '#384B70',
        },
        voice: '#10B981',
        video: '#06B6D4',
        web: '#F59E0B',
        file: '#94A3B8',
        fifo: '#6366F1',
        spq: '#8B5CF6',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
