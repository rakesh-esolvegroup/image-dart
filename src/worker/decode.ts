import { ImageToolError } from '../lib/errors';
import type { Size } from '../lib/dimensions';

export type InputFormat = 'png' | 'jpeg' | 'webp' | 'avif';

/** Images above this are rejected before decoding, so the tab doesn't run out of memory. */
export const MAX_PIXELS = 100_000_000;

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/** Detects the real file type from its first bytes. The file extension isn't trusted. */
export function detectFormat(bytes: Uint8Array): InputFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 && // P
    bytes[2] === 0x4e && // N
    bytes[3] === 0x47 && // G
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'webp';
  }
  // AVIF is an ISO-BMFF file: a "ftyp" box whose major or compatible brands include avif/avis
  if (bytes.length >= 16 && ascii(bytes, 4, 8) === 'ftyp') {
    const boxSize = Math.min(
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(0),
      bytes.length,
    );
    for (let i = 8; i + 4 <= boxSize; i += 4) {
      const brand = ascii(bytes, i, i + 4);
      if (brand === 'avif' || brand === 'avis') return 'avif';
    }
  }
  return null;
}

/**
 * Reads the pixel dimensions from the file header without decoding the image.
 * Returns null if the header can't be parsed.
 */
export function readDimensions(bytes: Uint8Array, format: InputFormat): Size | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === 'png') {
    // 8-byte signature, then the IHDR chunk: length(4) "IHDR"(4) width(4) height(4)
    if (bytes.length < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (format === 'webp') return readWebpDimensions(bytes, view);
  if (format === 'avif') return readAvifDimensions(bytes, view);

  // JPEG: walk the segments until a Start-Of-Frame marker
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return null;
    const marker = bytes[pos + 1];
    if (marker === 0xff) {
      pos++; // fill byte
      continue;
    }
    // Standalone markers have no length field
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      pos += 2;
      continue;
    }
    const length = view.getUint16(pos + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (pos + 9 > bytes.length) return null;
      return { height: view.getUint16(pos + 5), width: view.getUint16(pos + 7) };
    }
    pos += 2 + length;
  }
  return null;
}

/** WebP: the first chunk is VP8 (lossy), VP8L (lossless) or VP8X (extended). */
function readWebpDimensions(bytes: Uint8Array, view: DataView): Size | null {
  if (bytes.length < 30) return null;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === 'VP8X') {
    const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    return { width: 1 + u24(24), height: 1 + u24(27) };
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

/**
 * AVIF: image sizes live in "ispe" boxes. A file can hold a thumbnail too, so take
 * the largest one found near the start of the file.
 */
function readAvifDimensions(bytes: Uint8Array, view: DataView): Size | null {
  let best: Size | null = null;
  const end = Math.min(bytes.length - 16, 64 * 1024);
  for (let i = 4; i < end; i++) {
    // "ispe" type, then version/flags (4 bytes), width (4), height (4)
    if (
      bytes[i] === 0x69 &&
      bytes[i + 1] === 0x73 &&
      bytes[i + 2] === 0x70 &&
      bytes[i + 3] === 0x65
    ) {
      const size = { width: view.getUint32(i + 8), height: view.getUint32(i + 12) };
      if (!best || size.width * size.height > best.width * best.height) best = size;
    }
  }
  return best;
}

/** Throws if the type is unsupported or the image is too large to process safely. */
export function inspectInput(buffer: ArrayBuffer): { format: InputFormat; size: Size | null } {
  const bytes = new Uint8Array(buffer);
  const format = detectFormat(bytes);
  if (!format) {
    throw new ImageToolError(
      'UNSUPPORTED_TYPE',
      'Only PNG, JPEG, WebP and AVIF images are supported.',
    );
  }
  const size = readDimensions(bytes, format);
  if (size && size.width * size.height > MAX_PIXELS) {
    const mp = Math.round((size.width * size.height) / 1_000_000);
    throw new ImageToolError(
      'TOO_LARGE',
      `Image is ${size.width}×${size.height} (${mp} MP). The limit is ${MAX_PIXELS / 1_000_000} MP.`,
    );
  }
  return { format, size };
}
