export const DEFAULT_PATTERN = '{name}';

export const PATTERN_TOKENS = ['{name}', '{width}', '{height}', '{quality}', '{format}'] as const;

export interface NameInfo {
  width: number;
  height: number;
  /** null for lossless */
  quality: number | null;
  format: 'webp' | 'avif';
}

/** "holiday.photo.PNG" → "holiday.photo" */
export function baseName(filename: string): string {
  return filename.replace(/\.[^./\\]+$/, '') || 'image';
}

/**
 * Builds the output file name from a pattern, e.g.
 *   "{name}-{width}w" + photo.png (1200 px wide, WebP) → "photo-1200w.webp"
 * Characters Windows/macOS don't allow in file names are replaced with "-".
 */
export function outputFilename(pattern: string, original: string, info: NameInfo): string {
  const values: Record<string, string> = {
    '{name}': baseName(original),
    '{width}': String(info.width),
    '{height}': String(info.height),
    '{quality}': info.quality === null ? 'lossless' : String(info.quality),
    '{format}': info.format,
  };
  const filled = (pattern || DEFAULT_PATTERN).replace(
    /\{(name|width|height|quality|format)\}/g,
    (token) => values[token],
  );
  const safe = filled
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '') // no leading/trailing dots
    .slice(0, 150);
  return `${safe || baseName(original)}.${info.format}`;
}
