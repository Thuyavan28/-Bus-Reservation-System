import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // host: true => reachable from phones on the same network (needed to scan the payment QR)
  server: { host: true, port: 5173, proxy: { '/api': 'http://localhost:4000', '/mock-gateway': 'http://localhost:4000' } },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'zustand'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
});
