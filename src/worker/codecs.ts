import decodePng from '@jsquash/png/decode';
import decodeJpeg from '@jsquash/jpeg/decode';
import encodeWebp from '@jsquash/webp/encode';
import decodeWebp from '@jsquash/webp/decode';
import resize from '@jsquash/resize';
import type { InputFormat } from './decode';

export type OutputFormat = 'webp' | 'avif';

export const OUTPUT_MIME: Record<OutputFormat, 'image/webp' | 'image/avif'> = {
  webp: 'image/webp',
  avif: 'image/avif',
};

/**
 * AVIF codecs are big (~4.6 MB of WebAssembly), so they're loaded only when someone
 * actually picks AVIF or drops an AVIF file.
 */
const avifEncoder = () => import('@jsquash/avif/encode').then((m) => m.default);
const avifDecoder = () => import('@jsquash/avif/decode').then((m) => m.default);

/**
 * Thin wrappers around the jSquash WebAssembly codecs.
 * Each codec loads its .wasm file lazily, on first use.
 */
export const codecs = {
  async decode(buffer: ArrayBuffer, format: InputFormat): Promise<ImageData> {
    switch (format) {
      case 'png':
        return decodePng(buffer);
      case 'jpeg':
        // Apply the EXIF orientation, otherwise phone photos come out sideways
        return decodeJpeg(buffer, { preserveOrientation: true });
      case 'webp':
        return decodeWebp(buffer);
      case 'avif': {
        const image = await (await avifDecoder())(buffer);
        if (!image) throw new Error('AVIF decode failed');
        return image as ImageData;
      }
    }
  },

  /**
   * `quality` is 0–100 for both formats. `effort` trades speed for size: the
   * compress-to-target search encodes many times, so it asks for a faster AVIF encode.
   */
  async encodeLossy(
    image: ImageData,
    quality: number,
    format: OutputFormat = 'webp',
    effort: 'normal' | 'fast' = 'normal',
  ): Promise<ArrayBuffer> {
    if (format === 'avif') {
      const encode = await avifEncoder();
      return encode(image, { quality, speed: effort === 'fast' ? 8 : 6 });
    }
    return encodeWebp(image, { quality, method: 4 });
  },

  async encodeLossless(image: ImageData, format: OutputFormat = 'webp'): Promise<ArrayBuffer> {
    if (format === 'avif') {
      const encode = await avifEncoder();
      return encode(image, { lossless: true, speed: 6 });
    }
    // In WebP lossless mode, `quality` means compression effort, not visual quality
    return encodeWebp(image, { lossless: 1, quality: 75, method: 4 });
  },

  resize(image: ImageData, width: number, height: number): Promise<ImageData> {
    return resize(image, {
      width,
      height,
      method: 'lanczos3',
      fitMethod: 'stretch',
      premultiply: true, // avoids dark fringes around transparent edges
      linearRGB: true,
    });
  },
};

export type Codecs = typeof codecs;
