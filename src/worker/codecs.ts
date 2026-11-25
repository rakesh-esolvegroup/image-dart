import decodePng from '@jsquash/png/decode';
import decodeJpeg from '@jsquash/jpeg/decode';
import encodeWebp from '@jsquash/webp/encode';
import resize from '@jsquash/resize';
import type { InputFormat } from './decode';

/**
 * Thin wrappers around the jSquash WebAssembly codecs.
 * Each codec loads its .wasm file lazily, on first use.
 */
export const codecs = {
  decode(buffer: ArrayBuffer, format: InputFormat): Promise<ImageData> {
    return format === 'png'
      ? decodePng(buffer)
      : // Apply the EXIF orientation, otherwise phone photos come out sideways
        decodeJpeg(buffer, { preserveOrientation: true });
  },

  encodeLossy(image: ImageData, quality: number): Promise<ArrayBuffer> {
    return encodeWebp(image, { quality, method: 4 });
  },

  encodeLossless(image: ImageData): Promise<ArrayBuffer> {
    // In lossless mode, `quality` means compression effort, not visual quality
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
