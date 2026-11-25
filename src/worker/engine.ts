import { ImageToolError } from '../lib/errors';
import { fitWithin } from '../lib/dimensions';
import { inspectInput, type InputFormat } from './decode';
import { compressToTarget } from './targetSize';
import type { Codecs } from './codecs';

export interface ConvertOptions {
  /** 1–100. Ignored when lossless is true. */
  quality: number;
  lossless: boolean;
}

export interface CompressOptions {
  targetBytes: number;
  maxWidth?: number;
  maxHeight?: number;
}

export type EngineProgress =
  | { stage: 'decode' }
  | { stage: 'resize'; width: number; height: number }
  | { stage: 'encode'; attempt: number; quality: number | null; bytes?: number };

export interface ImageResult {
  buffer: ArrayBuffer;
  mimeType: 'image/webp';
  inputFormat: InputFormat;
  inputBytes: number;
  outputBytes: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  /** WebP quality used. null for lossless. */
  quality: number | null;
  lossless: boolean;
  resized: boolean;
  attempts: number;
  durationMs: number;
}

export type ProgressFn = (p: EngineProgress) => void;

async function decode(input: ArrayBuffer, codecs: Codecs, onProgress?: ProgressFn) {
  const { format } = inspectInput(input);
  onProgress?.({ stage: 'decode' });
  try {
    return { format, image: await codecs.decode(input, format) };
  } catch {
    throw new ImageToolError('DECODE_FAILED', 'The image file appears to be damaged.');
  }
}

async function encodeOrFail<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ImageToolError) throw err;
    throw new ImageToolError('ENCODE_FAILED', 'WebP encoding failed.');
  }
}

/** Feature 1: convert a PNG/JPEG to WebP at a fixed quality (or lossless). */
export async function convertImage(
  input: ArrayBuffer,
  options: ConvertOptions,
  codecs: Codecs,
  onProgress?: ProgressFn,
): Promise<ImageResult> {
  const started = performance.now();
  const quality = Math.round(options.quality);
  if (!options.lossless && !(quality >= 1 && quality <= 100)) {
    throw new ImageToolError('INVALID_OPTIONS', 'Quality must be between 1 and 100.');
  }

  const { format, image } = await decode(input, codecs, onProgress);
  onProgress?.({ stage: 'encode', attempt: 1, quality: options.lossless ? null : quality });
  const buffer = await encodeOrFail(() =>
    options.lossless ? codecs.encodeLossless(image) : codecs.encodeLossy(image, quality),
  );

  return {
    buffer,
    mimeType: 'image/webp',
    inputFormat: format,
    inputBytes: input.byteLength,
    outputBytes: buffer.byteLength,
    originalWidth: image.width,
    originalHeight: image.height,
    width: image.width,
    height: image.height,
    quality: options.lossless ? null : quality,
    lossless: options.lossless,
    resized: false,
    attempts: 1,
    durationMs: Math.round(performance.now() - started),
  };
}

/** Feature 2: compress to a target file size, optionally capping the dimensions first. */
export async function compressImage(
  input: ArrayBuffer,
  options: CompressOptions,
  codecs: Codecs,
  onProgress?: ProgressFn,
): Promise<ImageResult> {
  const started = performance.now();
  const { format, image: decoded } = await decode(input, codecs, onProgress);

  let image = decoded;
  const capped = fitWithin(decoded, options.maxWidth, options.maxHeight);
  if (capped.width !== decoded.width || capped.height !== decoded.height) {
    onProgress?.({ stage: 'resize', ...capped });
    image = await codecs.resize(decoded, capped.width, capped.height);
  }

  const result = await encodeOrFail(() =>
    compressToTarget(
      image,
      { targetBytes: options.targetBytes },
      {
        encode: (img, q) => codecs.encodeLossy(img, q),
        resize: (img, w, h) => {
          onProgress?.({ stage: 'resize', width: w, height: h });
          return codecs.resize(img, w, h);
        },
      },
      (p) =>
        onProgress?.({ stage: 'encode', attempt: p.attempt, quality: p.quality, bytes: p.bytes }),
    ),
  );

  return {
    buffer: result.buffer,
    mimeType: 'image/webp',
    inputFormat: format,
    inputBytes: input.byteLength,
    outputBytes: result.buffer.byteLength,
    originalWidth: decoded.width,
    originalHeight: decoded.height,
    width: result.width,
    height: result.height,
    quality: result.quality,
    lossless: false,
    resized: image !== decoded || result.resized,
    attempts: result.attempts,
    durationMs: Math.round(performance.now() - started),
  };
}
