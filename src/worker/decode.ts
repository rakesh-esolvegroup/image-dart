import { ImageToolError } from '../lib/errors';
import type { Size } from '../lib/dimensions';

export type InputFormat = 'png' | 'jpeg';

/** Images above this are rejected before decoding, so the tab doesn't run out of memory. */
export const MAX_PIXELS = 100_000_000;

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

/** Throws if the type is unsupported or the image is too large to process safely. */
export function inspectInput(buffer: ArrayBuffer): { format: InputFormat; size: Size | null } {
  const bytes = new Uint8Array(buffer);
  const format = detectFormat(bytes);
  if (!format) {
    throw new ImageToolError('UNSUPPORTED_TYPE', 'Only PNG and JPEG images are supported.');
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
