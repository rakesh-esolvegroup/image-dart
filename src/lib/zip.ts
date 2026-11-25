import { zipSync, type Zippable } from 'fflate';

/**
 * Makes file names unique inside a zip: "photo.webp", "photo.webp" → "photo.webp", "photo (2).webp".
 * Case-insensitive, because Windows and macOS treat "A.webp" and "a.webp" as the same file.
 */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

/** "webp-images-2026-11-25-1830.zip" */
export function zipFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `webp-images-${stamp}.zip`;
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/**
 * Bundles files into a zip. WebP is already compressed, so entries are stored
 * (level 0): zipping is instant and the archive is no bigger than the images.
 */
export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const names = uniqueNames(entries.map((e) => e.name));
  const files: Zippable = {};
  for (let i = 0; i < entries.length; i++) {
    files[names[i]] = [new Uint8Array(await entries[i].blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(files)], { type: 'application/zip' });
}
