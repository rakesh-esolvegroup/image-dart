/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // jSquash loads its own .wasm files at runtime; pre-bundling breaks those URLs.
  optimizeDeps: {
    exclude: ['@jsquash/png', '@jsquash/jpeg', '@jsquash/webp', '@jsquash/resize'],
  },
  // The codec Web Worker uses ES module imports.
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
