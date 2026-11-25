import * as Comlink from 'comlink';
import { codecs } from './codecs';
import {
  compressImage,
  convertImage,
  type CompressOptions,
  type ConvertOptions,
  type EngineProgress,
  type ImageResult,
} from './engine';
import { toErrorPayload, type ErrorPayload } from '../lib/errors';

/**
 * Results travel back as plain envelopes. Thrown errors lose custom fields (like `code`)
 * when Comlink serializes them across postMessage.
 */
export type WorkerResponse = { ok: true; result: ImageResult } | { ok: false; error: ErrorPayload };

type Progress = (p: EngineProgress) => void;

async function run(task: () => Promise<ImageResult>): Promise<WorkerResponse> {
  try {
    const result = await task();
    // Transfer the output buffer instead of copying it
    return Comlink.transfer({ ok: true, result }, [result.buffer]);
  } catch (err) {
    return { ok: false, error: toErrorPayload(err) };
  }
}

const api = {
  async convert(file: Blob, options: ConvertOptions, onProgress?: Progress) {
    return run(async () => convertImage(await file.arrayBuffer(), options, codecs, onProgress));
  },
  async compress(file: Blob, options: CompressOptions, onProgress?: Progress) {
    return run(async () => compressImage(await file.arrayBuffer(), options, codecs, onProgress));
  },
};

export type CodecWorkerApi = typeof api;

Comlink.expose(api);
