import { describe, expect, it } from 'vitest';
import { describeCompress, describeConvert } from '../src/ui/describe';
import type { ResultInfo } from '../src/ui/jobs';

const KB = 1024;

function result(patch: Partial<ResultInfo>): ResultInfo {
  return {
    mimeType: 'image/webp',
    inputFormat: 'png',
    inputBytes: 2048 * KB,
    outputBytes: 150 * KB,
    originalWidth: 4000,
    originalHeight: 3000,
    width: 4000,
    height: 3000,
    quality: 72,
    lossless: false,
    resized: false,
    attempts: 7,
    durationMs: 900,
    ...patch,
  };
}

describe('describeConvert', () => {
  it('shows dimensions and quality', () => {
    expect(describeConvert(result({}))).toEqual({ text: '4000×3000 · quality 72', tone: 'normal' });
    expect(describeConvert(result({ lossless: true, quality: null })).text).toBe(
      '4000×3000 · lossless',
    );
  });

  it('warns with a fix when the WebP is larger than the original', () => {
    expect(describeConvert(result({ lossless: true, outputBytes: 3000 * KB }))).toEqual({
      text: '4000×3000 · larger than the original. Turn off Lossless for photos.',
      tone: 'warn',
    });
    expect(describeConvert(result({ outputBytes: 3000 * KB })).text).toContain(
      'Try a lower quality.',
    );
  });
});

describe('describeCompress', () => {
  it('quality alone was enough', () => {
    expect(describeCompress(result({}), { targetBytes: 160 * KB })).toEqual({
      text: '4000×3000 · quality 72',
      tone: 'normal',
    });
  });

  it('mentions the max-width cap when that is the only resize', () => {
    const r = result({ width: 1200, height: 900, resized: true });
    expect(describeCompress(r, { targetBytes: 160 * KB, maxWidth: 1200 })).toEqual({
      text: '1200×900 (max width) · quality 72',
      tone: 'normal',
    });
  });

  it('calls out an extra resize needed to reach the target', () => {
    const r = result({ width: 486, height: 365, resized: true, quality: 35 });
    expect(describeCompress(r, { targetBytes: 25 * KB })).toEqual({
      text: 'Resized to 486×365 to fit 25 KB · quality 35',
      tone: 'note',
    });
    // Even with a max width set, shrinking below it means the target forced it
    expect(describeCompress(r, { targetBytes: 25 * KB, maxWidth: 1200 }).tone).toBe('note');
  });

  it('advises keeping the original when it was already small enough', () => {
    const r = result({ inputBytes: 40 * KB, outputBytes: 55 * KB, quality: 95 });
    expect(describeCompress(r, { targetBytes: 160 * KB })).toEqual({
      text: 'The original is already under 160 KB. This WebP is larger, so keep the original.',
      tone: 'warn',
    });
  });
});
