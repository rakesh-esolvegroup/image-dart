import { describe, expect, it, vi } from 'vitest';
import { compressToTarget, type TargetSizeDeps } from '../src/worker/targetSize';

/** Stand-in image: only the dimensions matter to the search logic. */
function fakeImage(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(0), colorSpace: 'srgb' } as ImageData;
}

/** Mock encoder whose output size is predictable: bytesPerPixelAtQ100 × pixels × quality/100. */
function linearDeps(bytesPerPixelAtQ100: number): TargetSizeDeps & {
  encode: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
} {
  return {
    encode: vi.fn(async (img: ImageData, q: number) => {
      return new ArrayBuffer(Math.round(img.width * img.height * bytesPerPixelAtQ100 * (q / 100)));
    }),
    resize: vi.fn(async (_img: ImageData, w: number, h: number) => fakeImage(w, h)),
  };
}

describe('compressToTarget', () => {
  it('returns max quality in one attempt when it already fits', async () => {
    const deps = linearDeps(1);
    const result = await compressToTarget(fakeImage(100, 100), { targetBytes: 50_000 }, deps);
    expect(result.quality).toBe(95);
    expect(result.attempts).toBe(1);
    expect(result.resized).toBe(false);
    expect(deps.resize).not.toHaveBeenCalled();
  });

  it('finds the highest quality that fits, within the tolerance', async () => {
    // 10,000 px × 1 B × q/100 ≤ 6,150  ⇔  q ≤ 61.5, so the true answer is 61
    const deps = linearDeps(1);
    const result = await compressToTarget(fakeImage(100, 100), { targetBytes: 6_150 }, deps);
    expect(result.buffer.byteLength).toBeLessThanOrEqual(6_150);
    expect(result.quality).toBeGreaterThanOrEqual(61 - 2);
    expect(result.quality).toBeLessThanOrEqual(61);
    expect(result.attempts).toBeLessThanOrEqual(9);
    expect(result.resized).toBe(false);
  });

  it('downscales when even minimum quality is too big, keeping the aspect ratio', async () => {
    // 1,000,000 px at q30 = 300 KB, but the target is 100 KB
    const deps = linearDeps(1);
    const source = fakeImage(1200, 800);
    const result = await compressToTarget(source, { targetBytes: 100_000 }, deps);
    expect(result.resized).toBe(true);
    expect(result.buffer.byteLength).toBeLessThanOrEqual(100_000);
    expect(result.width).toBeLessThan(1200);
    expect(result.width / result.height).toBeCloseTo(1.5, 1);
  });

  it('always resizes from the original pixels, never from a previous resize', async () => {
    // Make shrinking barely effective so several passes are needed
    const deps = linearDeps(1);
    deps.encode.mockImplementation(async (img: ImageData, q: number) => {
      return new ArrayBuffer(Math.round(Math.sqrt(img.width * img.height) * 400 * (q / 100)));
    });
    const source = fakeImage(2000, 2000);
    await compressToTarget(source, { targetBytes: 50_000 }, deps).catch(() => {});
    expect(deps.resize.mock.calls.length).toBeGreaterThan(1);
    for (const call of deps.resize.mock.calls) expect(call[0]).toBe(source);
  });

  it('reports progress for every attempt', async () => {
    const deps = linearDeps(1);
    const onProgress = vi.fn();
    const result = await compressToTarget(
      fakeImage(100, 100),
      { targetBytes: 6_150 },
      deps,
      onProgress,
    );
    expect(onProgress).toHaveBeenCalledTimes(result.attempts);
    expect(onProgress.mock.calls[0][0]).toMatchObject({ pass: 0, attempt: 1, quality: 95 });
  });

  it('throws TARGET_UNREACHABLE when nothing fits', async () => {
    const deps = linearDeps(1);
    deps.encode.mockResolvedValue(new ArrayBuffer(1_000_000)); // size never shrinks
    await expect(
      compressToTarget(fakeImage(500, 500), { targetBytes: 10_000 }, deps),
    ).rejects.toMatchObject({ code: 'TARGET_UNREACHABLE' });
  });

  it('rejects invalid options', async () => {
    const deps = linearDeps(1);
    await expect(
      compressToTarget(fakeImage(10, 10), { targetBytes: 0 }, deps),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(
      compressToTarget(
        fakeImage(10, 10),
        { targetBytes: 100, minQuality: 90, maxQuality: 50 },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });
});
