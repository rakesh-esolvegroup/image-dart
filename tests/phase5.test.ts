import { describe, expect, it } from 'vitest';
import { baseName, outputFilename } from '../src/lib/filename';
import { DEFAULT_PREFS, parsePrefs, PrefsStore } from '../src/lib/prefs';
import { pastedImages } from '../src/lib/paste';
import { detectFormat, readDimensions } from '../src/worker/decode';

const info = { width: 1200, height: 800, quality: 80, format: 'webp' as const };

describe('outputFilename (file name pattern)', () => {
  it('defaults to the original name with the new extension', () => {
    expect(outputFilename('{name}', 'holiday.photo.PNG', info)).toBe('holiday.photo.webp');
    expect(outputFilename('', 'a.jpg', { ...info, format: 'avif' })).toBe('a.avif');
  });

  it('fills every token', () => {
    expect(outputFilename('{name}-{width}x{height}-q{quality}-{format}', 'cat.jpg', info)).toBe(
      'cat-1200x800-q80-webp.webp',
    );
    expect(outputFilename('{name}-{quality}', 'logo.png', { ...info, quality: null })).toBe(
      'logo-lossless.webp',
    );
  });

  it('keeps unknown tokens as text and replaces characters not allowed in file names', () => {
    expect(outputFilename('{name}-{date}', 'a.png', info)).toBe('a-{date}.webp');
    expect(outputFilename('web/{name}:v2*', 'a.png', info)).toBe('web-a-v2-.webp');
  });

  it('never produces an empty or hidden name', () => {
    expect(outputFilename('...', 'photo.png', info)).toBe('photo.webp');
    expect(outputFilename('  ', 'photo.png', info)).toBe('photo.webp');
    expect(baseName('.png')).toBe('image');
  });
});

describe('prefs (remembered settings)', () => {
  it('falls back to defaults for missing or corrupt data', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('"a string"')).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid values and drops invalid ones individually', () => {
    const prefs = parsePrefs(
      JSON.stringify({
        convert: { quality: 55, lossless: 'yes' },
        compress: { targetKb: 3, maxWidth: 1200 },
        output: { format: 'gif', pattern: '{name}-small' },
      }),
    );
    expect(prefs).toEqual({
      convert: { quality: 55, lossless: false },
      compress: { targetKb: 160, maxWidth: 1200 },
      output: { format: 'webp', pattern: '{name}-small' },
    });
    expect(parsePrefs(JSON.stringify({ compress: { maxWidth: 999 } })).compress.maxWidth).toBe(
      undefined,
    );
  });

  it('saves changes and restores them on the next visit', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const first = new PrefsStore(storage);
    const seen: string[] = [];
    first.subscribe((_, changed) => seen.push(changed));
    first.set('output', { format: 'avif' });
    first.set('compress', { targetKb: 250 });
    expect(seen).toEqual(['output', 'compress']);

    const next = new PrefsStore(storage);
    expect(next.get().output.format).toBe('avif');
    expect(next.get().compress.targetKb).toBe(250);
  });

  it('still works when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    const store = new PrefsStore(blocked);
    expect(store.get()).toEqual(DEFAULT_PREFS);
    expect(() => store.set('convert', { quality: 70 })).not.toThrow();
    expect(store.get().convert.quality).toBe(70);
  });
});

describe('pastedImages', () => {
  const clipboard = (...files: File[]) => ({ files }) as unknown as DataTransfer;
  const when = new Date(2026, 10, 25, 18, 30, 12);

  it('names generic screenshots with a timestamp', () => {
    const [file] = pastedImages(
      clipboard(new File(['x'], 'image.png', { type: 'image/png' })),
      when,
    );
    expect(file.name).toBe('pasted-2026-11-25-183012.png');
    expect(file.type).toBe('image/png');
  });

  it('keeps real file names and ignores non-images', () => {
    const files = pastedImages(
      clipboard(
        new File(['x'], 'holiday.jpg', { type: 'image/jpeg' }),
        new File(['x'], 'notes.txt', { type: 'text/plain' }),
      ),
      when,
    );
    expect(files.map((f) => f.name)).toEqual(['holiday.jpg']);
  });

  it('numbers several generic pastes and handles no clipboard', () => {
    const files = pastedImages(
      clipboard(
        new File(['x'], 'image.png', { type: 'image/png' }),
        new File(['x'], 'image.jpeg', { type: 'image/jpeg' }),
      ),
      when,
    );
    expect(files.map((f) => f.name)).toEqual([
      'pasted-2026-11-25-183012-1.png',
      'pasted-2026-11-25-183012-2.jpg',
    ]);
    expect(pastedImages(null)).toEqual([]);
  });
});

describe('WebP / AVIF input detection', () => {
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(
      parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
    );

  it('recognises WebP and AVIF by their headers', () => {
    expect(detectFormat(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('webp');
    expect(detectFormat(bytes([0, 0, 0, 24], 'ftypavif', [0, 0, 0, 0], 'mif1miaf'))).toBe('avif');
    // AVIF listed only as a compatible brand
    expect(detectFormat(bytes([0, 0, 0, 24], 'ftypmif1', [0, 0, 0, 0], 'avifmiaf'))).toBe('avif');
    // HEIC is also ISO-BMFF but not supported
    expect(detectFormat(bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0], 'mif1heic'))).toBeNull();
  });

  it('reads WebP VP8X dimensions from the header', () => {
    const b = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8X', [10, 0, 0, 0], [0, 0, 0, 0]);
    const full = new Uint8Array(30);
    full.set(b);
    // canvas width-1 = 4031 (0x0FBF), height-1 = 3023 (0x0BCF), 24-bit little-endian
    full.set([0xbf, 0x0f, 0x00, 0xcf, 0x0b, 0x00], 24);
    expect(readDimensions(full, 'webp')).toEqual({ width: 4032, height: 3024 });
  });
});
