import type { ErrorPayload } from '../lib/errors';
import { toWebpFilename } from '../lib/format';
import type { ImageResult } from '../worker/engine';

export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

/** Result details without the pixel buffer (that's kept as `blob`). */
export type ResultInfo = Omit<ImageResult, 'buffer'>;

/** One file the user added, and what happened to it. */
export interface Job {
  id: string;
  file: File;
  /** Object URL of the original file, for the thumbnail. */
  inputUrl: string;
  status: JobStatus;
  /** Short progress text, e.g. "Encoding…". */
  progress?: string;
  /** Settings this job was (or is being) processed with, e.g. "q80" or "lossless". */
  settingsKey: string;
  /** Increases each time the job is (re)started, so stale results can be ignored. */
  run: number;
  result?: ResultInfo;
  blob?: Blob;
  outputUrl?: string;
  outputName: string;
  error?: ErrorPayload;
}

type Listener = (jobs: readonly Job[]) => void;

let nextId = 1;

/** Ordered list of jobs with change notifications. Owns the object URLs it creates. */
export class JobStore {
  private items: Job[] = [];
  private readonly listeners = new Set<Listener>();

  get jobs(): readonly Job[] {
    return this.items;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(files: File[], settingsKey: string): Job[] {
    const added = files.map<Job>((file) => ({
      id: `job-${nextId++}`,
      file,
      inputUrl: URL.createObjectURL(file),
      status: 'queued',
      settingsKey,
      run: 0,
      outputName: toWebpFilename(file.name),
    }));
    this.items = [...this.items, ...added];
    this.emit();
    return added;
  }

  get(id: string): Job | undefined {
    return this.items.find((j) => j.id === id);
  }

  update(id: string, patch: Partial<Job>): void {
    const job = this.get(id);
    if (!job) return;
    if ('outputUrl' in patch && job.outputUrl && job.outputUrl !== patch.outputUrl) {
      URL.revokeObjectURL(job.outputUrl);
    }
    Object.assign(job, patch);
    this.emit();
  }

  remove(id: string): void {
    const job = this.get(id);
    if (!job) return;
    release(job);
    this.items = this.items.filter((j) => j !== job);
    this.emit();
  }

  clear(): void {
    this.items.forEach(release);
    this.items = [];
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.items);
  }
}

function release(job: Job): void {
  URL.revokeObjectURL(job.inputUrl);
  if (job.outputUrl) URL.revokeObjectURL(job.outputUrl);
}

export type DownloadPlan =
  | { kind: 'none' }
  | { kind: 'busy'; finished: number; total: number }
  | { kind: 'single'; job: Job }
  | { kind: 'zip'; jobs: Job[] };

/**
 * What the main download button should do:
 * - still working → show progress
 * - exactly one finished image → download it as a .webp
 * - two or more → download them together as a .zip
 */
export function planDownload(jobs: readonly Job[]): DownloadPlan {
  if (jobs.length === 0) return { kind: 'none' };
  const busy = jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length;
  if (busy > 0) return { kind: 'busy', finished: jobs.length - busy, total: jobs.length };
  const done = jobs.filter((j) => j.status === 'done' && j.blob);
  if (done.length === 0) return { kind: 'none' };
  if (done.length === 1) return { kind: 'single', job: done[0] };
  return { kind: 'zip', jobs: done };
}
