/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Emits dist/sw.js with the list of files to cache for offline use.
 * The large AVIF codecs (~8 MB with the multi-thread build) are left out and cached
 * on first use instead, so a normal first visit stays around 1.3 MB.
 */
function serviceWorker(): Plugin {
  return {
    name: 'image-tool-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !/avif/i.test(f) && !f.endsWith('.map'))
        .sort();
      const precache = ['/', '/favicon.svg', '/manifest.webmanifest', ...files.map((f) => `/${f}`)];
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./sw/service-worker.js', import.meta.url), 'utf8')
        .replace('__VERSION__', version)
        .replace('self.__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
  // jSquash loads its own .wasm files at runtime; pre-bundling breaks those URLs.
  optimizeDeps: {
    exclude: ['@jsquash/png', '@jsquash/jpeg', '@jsquash/webp', '@jsquash/resize', '@jsquash/avif'],
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
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
