import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'react-router-dom'], radix: ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu'] } },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
