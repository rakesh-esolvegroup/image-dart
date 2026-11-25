import { downloadBlob } from '../lib/download';
import { toErrorPayload, type ImageErrorCode } from '../lib/errors';
import { formatBytes, percentSaved } from '../lib/format';
import { buildZip, zipFilename } from '../lib/zip';
import type { EngineProgress, ImageResult } from '../worker/engine';
import type { ResultNote } from './describe';
import { h, replace } from './dom';
import { createDropzone } from './dropzone';
import { createFileList } from './fileList';
import { JobStore, planDownload, type Job, type ResultInfo } from './jobs';
import { openCompare } from './preview';

/** Errors that changing the settings won't fix. */
const UNFIXABLE = new Set<ImageErrorCode>(['UNSUPPORTED_TYPE', 'TOO_LARGE', 'DECODE_FAILED']);

export interface BatchToolConfig<O> {
  /** Accessible name of the tool section. */
  label: string;
  /** Words for the status line, e.g. { doing: 'Converting', done: 'converted' }. */
  verb: { doing: string; done: string };
  /** The tool's own settings panel. Call `refresh()` on the returned tool when they change. */
  settings: HTMLElement;
  getOptions(): O;
  /** Identifies a combination of settings, to spot images processed with old settings. */
  settingsKey(options: O): string;
  run(file: File, options: O, onProgress: (p: EngineProgress) => void): Promise<ImageResult>;
  /** Settings to remember on the job (shown in the row). */
  used?(options: O): Job['used'];
  describe(job: Job): ResultNote;
  progressText(p: EngineProgress): string;
  /** Download name for a finished image (from the file-name pattern). */
  nameFor(file: File, result: ResultInfo): string;
}

/**
 * Shared engine for both tabs: add one or many images, process them in the background,
 * then download one image as a file, or several as a .zip.
 */
export function createBatchTool<O>(config: BatchToolConfig<O>) {
  const store = new JobStore();

  // ---- Processing ---------------------------------------------------------

  async function processJob(job: Job): Promise<void> {
    const run = job.run + 1;
    const options = config.getOptions();
    store.update(job.id, {
      run,
      status: 'queued',
      settingsKey: config.settingsKey(options),
      used: config.used?.(options),
      progress: undefined,
      result: undefined,
      blob: undefined,
      outputUrl: undefined,
      error: undefined,
    });
    // Ignore updates from a run the user has since replaced or removed
    const current = () => store.get(job.id)?.run === run;

    try {
      const result = await config.run(job.file, options, (p) => {
        if (current())
          store.update(job.id, { status: 'processing', progress: config.progressText(p) });
      });
      if (!current()) return;
      const { buffer, ...info } = result;
      const blob = new Blob([buffer], { type: info.mimeType });
      store.update(job.id, {
        status: 'done',
        result: info,
        outputName: config.nameFor(job.file, info),
        blob,
        outputUrl: URL.createObjectURL(blob),
        progress: undefined,
      });
    } catch (err) {
      if (!current()) return;
      store.update(job.id, { status: 'error', error: toErrorPayload(err), progress: undefined });
    }
  }

  /** Re-applies the file-name pattern to finished images (no re-encoding needed). */
  function rename(): void {
    for (const job of store.jobs) {
      if (job.status === 'done' && job.result) {
        store.update(job.id, { outputName: config.nameFor(job.file, job.result) });
      }
    }
  }

  function addFiles(files: File[]): void {
    const key = config.settingsKey(config.getOptions());
    for (const job of store.add(files, key)) void processJob(job);
  }

  /** Images processed with different settings. Files no setting can fix are left alone. */
  function staleJobs(): Job[] {
    const key = config.settingsKey(config.getOptions());
    return store.jobs.filter(
      (j) => j.settingsKey !== key && !(j.error && UNFIXABLE.has(j.error.code)),
    );
  }

  // ---- Summary & actions --------------------------------------------------

  const status = h('p', { class: 'summary-text', role: 'status', 'aria-live': 'polite' });
  const downloadButton = h('button', { type: 'button', class: 'btn btn-primary btn-download' });
  const applyButton = h('button', { type: 'button', class: 'btn' });
  const clearButton = h('button', { type: 'button', class: 'btn btn-quiet' }, 'Clear all');
  const summary = h(
    'div',
    { class: 'summary' },
    status,
    h('div', { class: 'summary-actions' }, applyButton, clearButton, downloadButton),
  );

  clearButton.addEventListener('click', () => store.clear());
  applyButton.addEventListener('click', () => {
    for (const job of staleJobs()) void processJob(job);
  });

  let zipping = false;
  downloadButton.addEventListener('click', async () => {
    const plan = planDownload(store.jobs);
    if (plan.kind === 'single' && plan.job.blob) {
      downloadBlob(plan.job.blob, plan.job.outputName);
    } else if (plan.kind === 'zip') {
      zipping = true;
      refresh();
      try {
        const zip = await buildZip(plan.jobs.map((j) => ({ name: j.outputName, blob: j.blob! })));
        const formats = new Set(plan.jobs.map((j) => j.result?.format));
        const prefix = formats.size === 1 ? `${[...formats][0]}-images` : 'images';
        downloadBlob(zip, zipFilename(new Date(), prefix));
      } finally {
        zipping = false;
        refresh();
      }
    }
  });

  // ---- Rendering ----------------------------------------------------------

  const fileList = createFileList({
    describe: config.describe,
    onCompare: (job) => openCompare(job),
    onDownload: (job) => job.blob && downloadBlob(job.blob, job.outputName),
    onRemove: (job) => store.remove(job.id),
  });

  function refresh(): void {
    const jobs = store.jobs;
    fileList.render(jobs);
    summary.hidden = jobs.length === 0;
    if (jobs.length === 0) return;

    const plan = planDownload(jobs);
    const done = jobs.filter((j) => j.status === 'done' && j.result);
    const failed = jobs.filter((j) => j.status === 'error').length;
    const before = done.reduce((sum, j) => sum + j.result!.inputBytes, 0);
    const after = done.reduce((sum, j) => sum + j.result!.outputBytes, 0);

    const parts: (string | HTMLElement)[] = [];
    if (plan.kind === 'busy') {
      parts.push(`${config.verb.doing}… ${plan.finished} of ${plan.total} done`);
    } else {
      parts.push(`${done.length} ${done.length === 1 ? 'image' : 'images'} ${config.verb.done}`);
    }
    if (done.length > 0) {
      const saved = percentSaved(before, after);
      parts.push(
        h(
          'span',
          { class: 'summary-sizes' },
          `${formatBytes(before)} → ${formatBytes(after)} (${saved >= 0 ? `${saved}% smaller` : `${-saved}% larger`})`,
        ),
      );
    }
    if (failed > 0) {
      parts.push(
        h('span', { class: 'summary-failed' }, `${failed} couldn’t be ${config.verb.done}`),
      );
    }
    replace(status, ...parts.flatMap((p, i) => (i === 0 ? [p] : [' · ', p])));

    // Main download button: one image → .webp, several → .zip
    downloadButton.hidden = plan.kind === 'none';
    downloadButton.disabled = plan.kind === 'busy' || zipping;
    if (zipping) downloadButton.textContent = 'Preparing ZIP…';
    else if (plan.kind === 'single') downloadButton.textContent = 'Download image';
    else if (plan.kind === 'zip')
      downloadButton.textContent = `Download ${plan.jobs.length} images (.zip)`;
    else if (plan.kind === 'busy') downloadButton.textContent = 'Download';
    downloadButton.title = plan.kind === 'single' ? plan.job.outputName : '';

    // Offer to re-run when the settings no longer match what was used
    const stale = staleJobs().length;
    applyButton.hidden = stale === 0;
    applyButton.textContent = `Apply new settings to ${stale} ${stale === 1 ? 'image' : 'images'}`;
  }

  store.subscribe(refresh);
  refresh();

  const element = h(
    'section',
    { class: 'tool', 'aria-label': config.label },
    config.settings,
    createDropzone(addFiles),
    summary,
    fileList.element,
  );

  return { element, refresh, rename, addFiles };
}
