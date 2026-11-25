const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

/**
 * Image files from a paste event. Screenshots arrive as a generic "image.png", so they
 * get a timestamped name, e.g. "pasted-2026-11-25-183012.png", to avoid every paste
 * downloading as "image.webp".
 */
export function pastedImages(data: DataTransfer | null, now = new Date()): File[] {
  if (!data) return [];
  const files = Array.from(data.files).filter((f) => IMAGE_TYPES.has(f.type));
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return files.map((file, i) => {
    if (file.name && !/^image\.\w+$/i.test(file.name)) return file; // keep real file names
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const suffix = files.length > 1 ? `-${i + 1}` : '';
    return new File([file], `pasted-${stamp}${suffix}.${ext}`, { type: file.type });
  });
}
