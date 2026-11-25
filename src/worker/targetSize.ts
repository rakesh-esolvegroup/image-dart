import { ImageToolError } from '../lib/errors';
import { scaleSize } from '../lib/dimensions';

export interface TargetSizeDeps {
  encode(image: ImageData, quality: number): Promise<ArrayBuffer>;
  resize(image: ImageData, width: number, height: number): Promise<ImageData>;
}

export interface TargetSizeOptions {
  targetBytes: number;
  /** Lowest quality tried before falling back to resizing. Default 30. */
  minQuality?: number;
  /** Highest quality tried. Default 95. */
  maxQuality?: number;
  /** Stop the search when the quality range is this narrow. Default 2. */
  tolerance?: number;
  /** How many times the image may be downscaled. Default 4. */
  maxResizePasses?: number;
  /** Never shrink the longer side below this. Default 16 px. */
  minDimension?: number;
}

export interface TargetSizeProgress {
  pass: number;
  attempt: number;
  quality: number;
  width: number;
  height: number;
  bytes: number;
}

export interface TargetSizeResult {
  buffer: ArrayBuffer;
  quality: number;
  width: number;
  height: number;
  resized: boolean;
  attempts: number;
}

/**
 * Finds the highest WebP quality whose output fits in `targetBytes`.
 *
 * 1. Binary-search quality between minQuality and maxQuality.
 * 2. If even minQuality is too big, shrink the image by about sqrt(target / size)
 *    (file size grows roughly with pixel count) and search again.
 *
 * Every resize starts from the original `source` pixels, so quality doesn't degrade
 * across passes.
 */
export async function compressToTarget(
  source: ImageData,
  options: TargetSizeOptions,
  deps: TargetSizeDeps,
  onProgress?: (p: TargetSizeProgress) => void,
): Promise<TargetSizeResult> {
  const {
    targetBytes,
    minQuality = 30,
    maxQuality = 95,
    tolerance = 2,
    maxResizePasses = 4,
    minDimension = 16,
  } = options;

  if (!Number.isFinite(targetBytes) || targetBytes <= 0) {
    throw new ImageToolError('INVALID_OPTIONS', 'Target size must be greater than 0.');
  }
  if (!(minQuality >= 0 && maxQuality <= 100 && minQuality <= maxQuality)) {
    throw new ImageToolError('INVALID_OPTIONS', 'Quality range must be within 0–100.');
  }

  let attempts = 0;
  let image = source;
  let scale = 1;

  for (let pass = 0; pass <= maxResizePasses; pass++) {
    const tryQuality = async (quality: number): Promise<ArrayBuffer> => {
      const buffer = await deps.encode(image, quality);
      attempts++;
      onProgress?.({
        pass,
        attempt: attempts,
        quality,
        width: image.width,
        height: image.height,
        bytes: buffer.byteLength,
      });
      return buffer;
    };
    const done = (buffer: ArrayBuffer, quality: number): TargetSizeResult => ({
      buffer,
      quality,
      width: image.width,
      height: image.height,
      resized: pass > 0,
      attempts,
    });

    // Best case: the highest quality already fits.
    const top = await tryQuality(maxQuality);
    if (top.byteLength <= targetBytes) return done(top, maxQuality);

    const bottom = await tryQuality(minQuality);
    if (bottom.byteLength <= targetBytes) {
      // Invariant: `lo` fits, `hi` doesn't.
      let lo = minQuality;
      let hi = maxQuality;
      let best = bottom;
      while (hi - lo > tolerance) {
        const mid = Math.round((lo + hi) / 2);
        const out = await tryQuality(mid);
        if (out.byteLength <= targetBytes) {
          lo = mid;
          best = out;
        } else {
          hi = mid;
        }
      }
      return done(best, lo);
    }

    // Too big even at the lowest quality: shrink the image and retry.
    if (pass === maxResizePasses) break;
    scale *= Math.sqrt(targetBytes / bottom.byteLength) * 0.95;
    const next = scaleSize(source, scale);
    if (Math.max(next.width, next.height) < minDimension) break;
    image = await deps.resize(source, next.width, next.height);
  }

  throw new ImageToolError(
    'TARGET_UNREACHABLE',
    `Could not get this image under ${Math.round(targetBytes / 1024)} KB. Try a larger target size.`,
  );
}
