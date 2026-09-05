import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Deployed at https://<user>.github.io/WorkPlanner/ — the base path must match
// the repo name or every asset 404s on Pages.
export default defineConfig({
  base: '/WorkPlanner/',
  build: {
    // The Firebase SDK is a ~600kB chunk by nature. It is code-split and loaded
    // only when Firebase is actually configured, so it never delays first paint
    // — the warning would just be noise in CI.
    chunkSizeWarningLimit: 700,
  },
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
