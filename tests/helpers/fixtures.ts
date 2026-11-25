/** Deterministic pseudo-random numbers (mulberry32), so fixtures are identical on every run. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A photo-like test image: smooth gradients, soft shapes and sensor-style grain.
 * It compresses roughly like a real photo (unlike pure noise or flat colour).
 */
export function makePhotoLike(
  width: number,
  height: number,
  grain = 6,
  seed = 42,
  detail = 0,
): ImageData {
  const rand = prng(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  const blobs = Array.from({ length: 12 }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: (0.08 + rand() * 0.2) * Math.min(width, height),
    c: [rand() * 255, rand() * 255, rand() * 255],
  }));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 90 + 70 * Math.sin(x / 97) + 30 * Math.cos(y / 61);
      let g = 110 + 50 * Math.sin((x + y) / 131);
      let b = 140 + 60 * Math.cos(y / 89) - 20 * Math.sin(x / 41);
      for (const blob of blobs) {
        const d = Math.hypot(x - blob.x, y - blob.y) / blob.r;
        if (d < 1) {
          const w = (1 - d) ** 2;
          r += (blob.c[0] - r) * w;
          g += (blob.c[1] - g) * w;
          b += (blob.c[2] - b) * w;
        }
      }
      if (detail) {
        // Fine structured texture (foliage, fabric, hair) that encoders can't just smooth away
        const t =
          Math.sin(x * 0.9 + Math.sin(y * 0.13) * 3) * Math.sin(y * 1.1 + Math.cos(x * 0.07) * 2) +
          0.5 * Math.sin((x + 2 * y) * 0.45);
        r += detail * t;
        g += detail * 0.8 * t;
        b += detail * 0.6 * t;
      }
      const i = (y * width + x) * 4;
      data[i] = r + (rand() - 0.5) * 2 * grain;
      data[i + 1] = g + (rand() - 0.5) * 2 * grain;
      data[i + 2] = b + (rand() - 0.5) * 2 * grain;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/** Small image with a transparency gradient, to check alpha is preserved. */
export function makeTransparent(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 7) & 255;
      data[i + 1] = (y * 5) & 255;
      data[i + 2] = 200;
      data[i + 3] = Math.round((x / (width - 1)) * 255);
    }
  }
  return new ImageData(data, width, height);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Just a PNG signature and IHDR header, enough for header parsing tests. */
export function pngHeader(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(33);
  bytes.set(PNG_SIGNATURE, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes.buffer;
}

/** SOI + APP0 + optional DHT + SOF header, enough for header parsing tests. */
export function jpegHeader(width: number, height: number, sofMarker = 0xc0): ArrayBuffer {
  const parts: number[] = [0xff, 0xd8];
  // APP0 (JFIF), length 16
  parts.push(0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0));
  // DHT (0xC4) must be skipped, it isn't a frame header
  parts.push(0xff, 0xc4, 0x00, 0x05, 0, 0, 0);
  // SOF: length 17, precision 8, height, width, 3 components
  parts.push(0xff, sofMarker, 0x00, 0x11, 0x08);
  parts.push(height >> 8, height & 255, width >> 8, width & 255, 0x03);
  parts.push(...new Array(9).fill(0));
  return new Uint8Array(parts).buffer;
}

/**
 * Inserts an EXIF APP1 segment with the given Orientation tag right after SOI,
 * the way phone cameras store rotation.
 */
export function withExifOrientation(jpeg: ArrayBuffer, orientation: number): ArrayBuffer {
  const tiff = [
    0x4d,
    0x4d,
    0x00,
    0x2a, // "MM" big-endian, magic 42
    0x00,
    0x00,
    0x00,
    0x08, // offset of IFD0
    0x00,
    0x01, // 1 entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01, // tag 0x0112 Orientation, SHORT, count 1
    0x00,
    orientation,
    0x00,
    0x00, // value
    0x00,
    0x00,
    0x00,
    0x00, // no next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0"
  const length = payload.length + 2;
  const app1 = [0xff, 0xe1, length >> 8, length & 255, ...payload];

  const src = new Uint8Array(jpeg);
  const out = new Uint8Array(src.length + app1.length);
  out.set(src.subarray(0, 2), 0);
  out.set(app1, 2);
  out.set(src.subarray(2), 2 + app1.length);
  return out.buffer;
}

export function isWebp(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer, 0, 12);
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
}
