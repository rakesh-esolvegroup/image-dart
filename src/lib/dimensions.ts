export interface Size {
  width: number;
  height: number;
}

/**
 * Shrinks `size` to fit inside maxWidth × maxHeight, keeping the aspect ratio.
 * Never upscales. Missing or non-positive limits are ignored.
 */
export function fitWithin(size: Size, maxWidth?: number, maxHeight?: number): Size {
  let scale = 1;
  if (maxWidth && maxWidth > 0 && size.width > maxWidth) {
    scale = Math.min(scale, maxWidth / size.width);
  }
  if (maxHeight && maxHeight > 0 && size.height > maxHeight) {
    scale = Math.min(scale, maxHeight / size.height);
  }
  if (scale === 1) return { width: size.width, height: size.height };
  return scaleSize(size, scale);
}

/** Scales both sides by `scale`, rounding and never going below 1 px. */
export function scaleSize(size: Size, scale: number): Size {
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
