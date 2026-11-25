const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** 1536 → "1.5 KB", 2_097_152 → "2.0 MB" (base 1024). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** "holiday.photo.PNG" → "holiday.photo.webp" */
export function toWebpFilename(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'image'}.webp`;
}

/**
 * Percentage saved, e.g. (2000, 500) → 75. Negative if the file grew.
 * Never reports 100% while the output still has bytes (56 KB → 102 B is 99%, not 100%).
 */
export function percentSaved(before: number, after: number): number {
  if (before <= 0) return 0;
  const saved = Math.round((1 - after / before) * 100);
  return after > 0 ? Math.min(saved, 99) : saved;
}
