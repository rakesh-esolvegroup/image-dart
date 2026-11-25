import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { simd } from 'wasm-feature-detect';
import { init as initPngDecode } from '@jsquash/png/decode';
import encodePng, { init as initPngEncode } from '@jsquash/png/encode';
import { init as initJpegDecode } from '@jsquash/jpeg/decode';
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode';
import { init as initWebpEncode } from '@jsquash/webp/encode';
import decodeWebp, { init as initWebpDecode } from '@jsquash/webp/decode';
import { initResize } from '@jsquash/resize';

async function compile(path: string): Promise<WebAssembly.Module> {
  const file = fileURLToPath(new URL(`../../node_modules/@jsquash/${path}`, import.meta.url));
  return WebAssembly.compile(await readFile(file));
}

// The emscripten init() accepts a precompiled module at runtime, though the typings don't say so.
type ModuleInit = (module: WebAssembly.Module) => Promise<unknown>;

let ready: Promise<void> | undefined;

/**
 * In the browser, jSquash fetches its .wasm files by URL. Node has no such URLs,
 * so compile the same files from node_modules and hand them over.
 */
export function initNodeCodecs(): Promise<void> {
  ready ??= (async () => {
    const png = await compile('png/codec/pkg/squoosh_png_bg.wasm');
    const webpEnc = (await simd())
      ? 'webp/codec/enc/webp_enc_simd.wasm'
      : 'webp/codec/enc/webp_enc.wasm';
    await Promise.all([
      initPngDecode(png),
      initPngEncode(png),
      (initJpegDecode as unknown as ModuleInit)(await compile('jpeg/codec/dec/mozjpeg_dec.wasm')),
      (initJpegEncode as unknown as ModuleInit)(await compile('jpeg/codec/enc/mozjpeg_enc.wasm')),
      (initWebpEncode as unknown as ModuleInit)(await compile(webpEnc)),
      (initWebpDecode as unknown as ModuleInit)(await compile('webp/codec/dec/webp_dec.wasm')),
      initResize(await compile('resize/lib/resize/pkg/squoosh_resize_bg.wasm')),
    ]);
  })();
  return ready;
}

export { encodePng, encodeJpeg, decodeWebp };
