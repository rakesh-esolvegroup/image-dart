/**
 * End-to-end tests of the engine with the real jSquash WebAssembly codecs
 * (the same .wasm files the browser uses), running in Node.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { codecs } from '../src/worker/codecs';
import { compressImage, convertImage } from '../src/worker/engine';
import { decodeWebp, encodeJpeg, encodePng, initNodeCodecs } from './helpers/nodeCodecs';
import { isWebp, makePhotoLike, makeTransparent, withExifOrientation } from './helpers/fixtures';

const KB = 1024;
let photoPng: ArrayBuffer; // ~2 MB photo-like PNG
let photoJpeg: ArrayBuffer;

beforeAll(async () => {
  await initNodeCodecs();
  const photo = makePhotoLike(1000, 750, 10, 42, 30);
  photoPng = await encodePng(photo);
  photoJpeg = await encodeJpeg(photo, { quality: 90 });
  console.info(
    `fixtures: PNG ${(photoPng.byteLength / KB).toFixed(0)} KB, JPEG ${(photoJpeg.byteLength / KB).toFixed(0)} KB (1000×750)`,
  );
});

describe('fixture', () => {
  it('is a realistic ~2 MB PNG', () => {
    expect(photoPng.byteLength).toBeGreaterThan(1.5 * KB * KB);
    expect(photoPng.byteLength).toBeLessThan(3.5 * KB * KB);
  });
});

describe('convertImage (Feature 1)', () => {
  it('converts PNG to lossy WebP with the same dimensions and a smaller size', async () => {
    const r = await convertImage(photoPng, { quality: 80, lossless: false }, codecs);
    expect(isWebp(r.buffer)).toBe(true);
    expect(r).toMatchObject({ inputFormat: 'png', width: 1000, height: 750, quality: 80 });
    expect(r.outputBytes).toBeLessThan(photoPng.byteLength * 0.5);
    console.info(`PNG → WebP q80: ${(r.outputBytes / KB).toFixed(0)} KB in ${r.durationMs} ms`);
  });

  it('converts JPEG to WebP', async () => {
    const r = await convertImage(photoJpeg, { quality: 80, lossless: false }, codecs);
    expect(isWebp(r.buffer)).toBe(true);
    expect(r.inputFormat).toBe('jpeg');
  });

  it('lossless mode reproduces every visible pixel and all transparency exactly', async () => {
    const original = makeTransparent(256, 128);
    const png = await encodePng(original);
    const r = await convertImage(png, { quality: 80, lossless: true }, codecs);
    expect(r.lossless).toBe(true);
    expect(r.quality).toBeNull();

    const out = await decodeWebp(r.buffer);
    expect({ width: out.width, height: out.height }).toEqual({ width: 256, height: 128 });
    let mismatches = 0;
    for (let i = 0; i < original.data.length; i += 4) {
      const alpha = original.data[i + 3];
      if (out.data[i + 3] !== alpha) mismatches++;
      // libwebp drops the colour of fully transparent pixels: invisible, and smaller files
      if (alpha === 0) continue;
      for (let c = 0; c < 3; c++) if (out.data[i + c] !== original.data[i + c]) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('keeps transparency in lossy mode', async () => {
    const png = await encodePng(makeTransparent(256, 128));
    const r = await convertImage(png, { quality: 75, lossless: false }, codecs);
    const out = await decodeWebp(r.buffer);
    const alphaAt = (x: number) => out.data[(10 * 256 + x) * 4 + 3];
    expect(alphaAt(0)).toBeLessThan(10); // left edge transparent
    expect(alphaAt(255)).toBeGreaterThan(245); // right edge opaque
  });

  it('applies EXIF orientation from phone photos (rotated 90°)', async () => {
    const landscape = await encodeJpeg(makePhotoLike(320, 200, 2), { quality: 85 });
    const rotated = withExifOrientation(landscape, 6);
    const r = await convertImage(rotated, { quality: 80, lossless: false }, codecs);
    expect({ width: r.width, height: r.height }).toEqual({ width: 200, height: 320 });
  });
});

describe('compressImage (Feature 2)', () => {
  it('compresses a ~2 MB PNG to ≤ 160 KB', async () => {
    const target = 160 * KB;
    const r = await compressImage(photoPng, { targetBytes: target }, codecs);
    expect(isWebp(r.buffer)).toBe(true);
    expect(r.outputBytes).toBeLessThanOrEqual(target);
    expect(r.outputBytes).toBeGreaterThan(target * 0.6); // didn't waste quality
    console.info(
      `2 MB PNG → ${(r.outputBytes / KB).toFixed(0)} KB: q${r.quality}, ${r.width}×${r.height}, ` +
        `resized=${r.resized}, ${r.attempts} encodes, ${r.durationMs} ms`,
    );
  });

  it('falls back to resizing for a very small target', async () => {
    const r = await compressImage(photoPng, { targetBytes: 25 * KB }, codecs);
    expect(r.outputBytes).toBeLessThanOrEqual(25 * KB);
    expect(r.resized).toBe(true);
    expect(r.width / r.height).toBeCloseTo(1000 / 750, 1);
    console.info(`→ 25 KB: q${r.quality}, ${r.width}×${r.height}, ${r.attempts} encodes`);
  });

  it('applies max width before compressing', async () => {
    const r = await compressImage(photoJpeg, { targetBytes: 500 * KB, maxWidth: 800 }, codecs);
    expect({ width: r.width, height: r.height }).toEqual({ width: 800, height: 600 });
    expect(r.resized).toBe(true);
    expect(r.originalWidth).toBe(1000);
  });
});

describe('errors', () => {
  it('rejects non-image input', async () => {
    const text = new TextEncoder().encode('definitely not a png').buffer;
    await expect(
      convertImage(text, { quality: 80, lossless: false }, codecs),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('reports damaged files as DECODE_FAILED', async () => {
    const truncated = photoPng.slice(0, 2000);
    await expect(
      convertImage(truncated, { quality: 80, lossless: false }, codecs),
    ).rejects.toMatchObject({ code: 'DECODE_FAILED' });
  });

  it('rejects an out-of-range quality', async () => {
    await expect(
      convertImage(photoPng, { quality: 0, lossless: false }, codecs),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });
});
