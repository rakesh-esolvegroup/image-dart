import * as Comlink from 'comlink';
import type { CodecWorkerApi, WorkerResponse } from '../worker/codec.worker';
import type {
  CompressOptions,
  ConvertOptions,
  EngineProgress,
  ImageResult,
} from '../worker/engine';
import { ImageToolError } from './errors';

interface Slot {
  worker: Worker;
  api: Comlink.Remote<CodecWorkerApi>;
  /** Rejects the in-flight task if the worker dies (e.g. out of memory). */
  crashed: Promise<never>;
}

type Task = (api: Comlink.Remote<CodecWorkerApi>) => Promise<WorkerResponse>;

/** 1–4 workers: leave one core for the UI, and cap memory use for big batches. */
export function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

function createSlot(): Slot {
  const worker = new Worker(new URL('../worker/codec.worker.ts', import.meta.url), {
    type: 'module',
  });
  const crashed = new Promise<never>((_, reject) => {
    worker.addEventListener('error', (e) => {
      e.preventDefault();
      reject(
        new ImageToolError('WORKER_CRASHED', 'The image processor crashed. Try a smaller image.'),
      );
    });
  });
  crashed.catch(() => {}); // handled per task, avoid unhandled-rejection noise
  return { worker, api: Comlink.wrap<CodecWorkerApi>(worker), crashed };
}

/**
 * Runs image jobs on a small pool of Web Workers, so several files process in
 * parallel without freezing the page. Workers are created lazily and reused.
 */
export class WorkerPool {
  private readonly size: number;
  private readonly all = new Set<Slot>();
  private readonly idle: Slot[] = [];
  private readonly waiting: Array<(slot: Slot) => void> = [];

  constructor(size = defaultPoolSize()) {
    this.size = size;
  }

  private spawn(): Slot {
    const slot = createSlot();
    this.all.add(slot);
    return slot;
  }

  convert(file: Blob, options: ConvertOptions, onProgress?: (p: EngineProgress) => void) {
    return this.run((api) =>
      api.convert(file, options, onProgress ? Comlink.proxy(onProgress) : undefined),
    );
  }

  compress(file: Blob, options: CompressOptions, onProgress?: (p: EngineProgress) => void) {
    return this.run((api) =>
      api.compress(file, options, onProgress ? Comlink.proxy(onProgress) : undefined),
    );
  }

  /** Stops all workers. Queued jobs never resolve, so only call this when tearing down. */
  terminate(): void {
    for (const slot of this.all) slot.worker.terminate();
    this.all.clear();
    this.idle.length = 0;
  }

  private async run(task: Task): Promise<ImageResult> {
    const slot = await this.acquire();
    let healthy = true;
    try {
      const response = await Promise.race([task(slot.api), slot.crashed]);
      if (!response.ok) throw new ImageToolError(response.error.code, response.error.message);
      return response.result;
    } catch (err) {
      if (err instanceof ImageToolError && err.code === 'WORKER_CRASHED') healthy = false;
      throw err;
    } finally {
      this.release(slot, healthy);
    }
  }

  private acquire(): Promise<Slot> {
    const slot = this.idle.pop();
    if (slot) return Promise.resolve(slot);
    if (this.all.size < this.size) return Promise.resolve(this.spawn());
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(slot: Slot, healthy: boolean): void {
    let next = slot;
    if (!healthy) {
      slot.worker.terminate();
      this.all.delete(slot);
      next = this.spawn(); // replace the dead worker
    }
    const waiter = this.waiting.shift();
    if (waiter) waiter(next);
    else this.idle.push(next);
  }
}
