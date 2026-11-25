import { fitWithin } from '../lib/dimensions';
import type { ResultInfo } from './jobs';

/** One line under the file name. `warn` is shown in red, `note` is highlighted. */
export interface ResultNote {
  text: string;
  tone: 'normal' | 'note' | 'warn';
}

const size = (r: ResultInfo) => `${r.width}×${r.height}`;

/** Convert tab: dimensions and quality, or advice when the WebP came out larger. */
export function describeConvert(r: ResultInfo): ResultNote {
  if (r.outputBytes > r.inputBytes) {
    return {
      text: `${size(r)} · larger than the original. ${r.lossless ? 'Turn off Lossless for photos.' : 'Try a lower quality.'}`,
      tone: 'warn',
    };
  }
  return {
    text: `${size(r)} · ${r.lossless ? 'lossless' : `quality ${r.quality}`}`,
    tone: 'normal',
  };
}

/**
 * Compress tab: explains how the target was reached, in particular when the image
 * had to be made smaller than the chosen max width to fit.
 */
export function describeCompress(
  r: ResultInfo,
  used: { targetBytes?: number; maxWidth?: number } = {},
): ResultNote {
  // Targets are whole KB the user typed, so show them that way (25 KB, not 25.0 KB)
  const target = used.targetBytes ? `${Math.round(used.targetBytes / 1024)} KB` : 'the target';
  if (r.outputBytes > r.inputBytes) {
    return {
      text: `The original is already under ${target}. This WebP is larger, so keep the original.`,
      tone: 'warn',
    };
  }
  const capped = fitWithin({ width: r.originalWidth, height: r.originalHeight }, used.maxWidth);
  if (r.width < capped.width) {
    return { text: `Resized to ${size(r)} to fit ${target} · quality ${r.quality}`, tone: 'note' };
  }
  if (capped.width < r.originalWidth) {
    return { text: `${size(r)} (max width) · quality ${r.quality}`, tone: 'normal' };
  }
  return { text: `${size(r)} · quality ${r.quality}`, tone: 'normal' };
}
