import { describe, expect, it } from 'vitest';
import { fitWithin, scaleSize } from '../src/lib/dimensions';
import { formatBytes, percentSaved, toWebpFilename } from '../src/lib/format';
import { ImageToolError, toErrorPayload } from '../src/lib/errors';
import { MAX_PIXELS, detectFormat, inspectInput, readDimensions } from '../src/worker/decode';
import { jpegHeader, pngHeader } from './helpers/fixtures';

const bytes = (buf: ArrayBuffer) => new Uint8Array(buf);

describe('formatBytes', () => {
  it('formats with base-1024 units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(160 * 1024)).toBe('160.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
  it('handles invalid input', () => {
    expect(formatBytes(-1)).toBe('–');
    expect(formatBytes(Number.NaN)).toBe('–');
  });
});

describe('toWebpFilename', () => {
  it('replaces only the last extension', () => {
    expect(toWebpFilename('photo.PNG')).toBe('photo.webp');
    expect(toWebpFilename('holiday.photo.jpeg')).toBe('holiday.photo.webp');
  });
  it('handles names without an extension', () => {
    expect(toWebpFilename('scan')).toBe('scan.webp');
    expect(toWebpFilename('.png')).toBe('image.webp');
  });
});

describe('percentSaved', () => {
  it('computes the saving, negative if the file grew', () => {
    expect(percentSaved(2000, 500)).toBe(75);
    expect(percentSaved(1000, 1200)).toBe(-20);
    expect(percentSaved(0, 10)).toBe(0);
  });
});

describe('fitWithin', () => {
  it('keeps the aspect ratio when capping width', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 800)).toEqual({ width: 800, height: 600 });
  });
  it('uses the tighter of width and height limits', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 2000, 600)).toEqual({
      width: 800,
      height: 600,
    });
  });
  it('never upscales and ignores empty limits', () => {
    expect(fitWithin({ width: 640, height: 480 }, 1920)).toEqual({ width: 640, height: 480 });
    expect(fitWithin({ width: 640, height: 480 }, 0, undefined)).toEqual({
      width: 640,
      height: 480,
    });
  });
  it('scaleSize never goes below 1 px', () => {
    expect(scaleSize({ width: 1000, height: 2 }, 0.1)).toEqual({ width: 100, height: 1 });
  });
});

describe('detectFormat', () => {
  it('recognises PNG and JPEG by magic bytes', () => {
    expect(detectFormat(bytes(pngHeader(10, 10)))).toBe('png');
    expect(detectFormat(bytes(jpegHeader(10, 10)))).toBe('jpeg');
  });
  it('rejects other content regardless of name', () => {
    expect(detectFormat(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(detectFormat(new TextEncoder().encode('hello, not an image'))).toBeNull();
    expect(detectFormat(new Uint8Array())).toBeNull();
  });
});

describe('readDimensions', () => {
  it('reads PNG IHDR', () => {
    expect(readDimensions(bytes(pngHeader(1920, 1080)), 'png')).toEqual({
      width: 1920,
      height: 1080,
    });
  });
  it('reads baseline and progressive JPEG frame headers, skipping DHT', () => {
    expect(readDimensions(bytes(jpegHeader(4032, 3024, 0xc0)), 'jpeg')).toEqual({
      width: 4032,
      height: 3024,
    });
    expect(readDimensions(bytes(jpegHeader(800, 600, 0xc2)), 'jpeg')).toEqual({
      width: 800,
      height: 600,
    });
  });
  it('returns null for a truncated header', () => {
    expect(readDimensions(new Uint8Array([0xff, 0xd8, 0xff]), 'jpeg')).toBeNull();
    expect(readDimensions(bytes(pngHeader(1, 1)).subarray(0, 20), 'png')).toBeNull();
  });
});

describe('inspectInput', () => {
  it('rejects unsupported files', () => {
    expect(() => inspectInput(new TextEncoder().encode('not an image').buffer)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_TYPE' }),
    );
  });
  it(`rejects images above ${MAX_PIXELS / 1e6} MP before decoding`, () => {
    expect(() => inspectInput(pngHeader(20_000, 6_000))).toThrowError(
      expect.objectContaining({ code: 'TOO_LARGE' }),
    );
    expect(() => inspectInput(jpegHeader(12_000, 9_000))).toThrowError(
      expect.objectContaining({ code: 'TOO_LARGE' }),
    );
  });
  it('accepts normal images', () => {
    expect(inspectInput(pngHeader(4000, 3000))).toEqual({
      format: 'png',
      size: { width: 4000, height: 3000 },
    });
  });
});

describe('toErrorPayload', () => {
  it('keeps the code of ImageToolError and maps others to UNKNOWN', () => {
    expect(toErrorPayload(new ImageToolError('TOO_LARGE', 'big'))).toEqual({
      code: 'TOO_LARGE',
      message: 'big',
    });
    expect(toErrorPayload(new Error('boom'))).toEqual({ code: 'UNKNOWN', message: 'boom' });
    expect(toErrorPayload('weird')).toEqual({ code: 'UNKNOWN', message: 'weird' });
  });
});
