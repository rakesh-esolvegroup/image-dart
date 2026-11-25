import { defineConfig } from 'vite';

export default defineConfig({
  // jSquash loads its own .wasm files at runtime; pre-bundling breaks those URLs.
  optimizeDeps: {
    exclude: ['@jsquash/png', '@jsquash/jpeg', '@jsquash/webp', '@jsquash/resize'],
  },
  // The codec Web Worker (Phase 1) uses ES module imports.
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
});
