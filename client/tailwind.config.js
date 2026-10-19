/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: { 50: '#eef5fe', 100: '#cde2fb', 200: '#9ec5f4', 300: '#6da7ec', 400: '#3987e5', 500: '#2a78d6', 600: '#1c5cab', 700: '#184f95', 800: '#104281', 900: '#0d366b' },
        ink: { 950: '#0d0d0d', 900: '#1a1a19', 850: '#222220', 800: '#2c2c2a', 700: '#383835' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px -4px rgba(16,24,40,.08)',
      },
    },
  },
  plugins: [],
};
