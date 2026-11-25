import { downloadBlob } from '../lib/download';
import { toErrorPayload, type ImageErrorCode } from '../lib/errors';
import { formatBytes, percentSaved } from '../lib/format';
import type { WorkerPool } from '../lib/workerPool';
import { buildZip, zipFilename } from '../lib/zip';
import type { ConvertOptions, EngineProgress } from '../worker/engine';
import { h, replace } from './dom';
import { createDropzone } from './dropzone';
import { createFileList } from './fileList';
import { JobStore, planDownload, type Job } from './jobs';

const settingsKey = (o: ConvertOptions) => (o.lossless ? 'lossless' : `q${o.quality}`);

/** Errors that changing quality or lossless won't fix. */
const UNFIXABLE = new Set<ImageErrorCode>(['UNSUPPORTED_TYPE', 'TOO_LARGE', 'DECODE_FAILED']);

function progressText(p: EngineProgress): string {
  if (p.stage === 'decode') return 'Reading image…';
  if (p.stage === 'resize') return 'Resizing…';
  return 'Converting to WebP…';
}

/** Feature 1: convert PNG/JPEG images to WebP, one or many at a time. */
export function createConvertTab(pool: WorkerPool): HTMLElement {
  const store = new JobStore();
  const options: ConvertOptions = { quality: 80, lossless: false };

  // ---- Processing ---------------------------------------------------------

  async function processJob(job: Job): Promise<void> {
    const run = job.run + 1;
    const opts = { ...options };
    store.update(job.id, {
      run,
      status: 'queued',
      settingsKey: settingsKey(opts),
      progress: undefined,
      result: undefined,
      blob: undefined,
      outputUrl: undefined,
      error: undefined,
    });
    // Ignore updates from a run the user has since replaced or removed
    const current = () => store.get(job.id)?.run === run;

    try {
      const result = await pool.convert(job.file, opts, (p) => {
        if (current()) store.update(job.id, { status: 'processing', progress: progressText(p) });
      });
      if (!current()) return;
      const { buffer, ...info } = result;
      const blob = new Blob([buffer], { type: 'image/webp' });
      store.update(job.id, {
        status: 'done',
        result: info,
        blob,
        outputUrl: URL.createObjectURL(blob),
        progress: undefined,
      });
    } catch (err) {
      if (!current()) return;
      store.update(job.id, {
        status: 'error',
        error: toErrorPayload(err),
        progress: undefined,
      });
    }
  }

  function addFiles(files: File[]): void {
    for (const job of store.add(files, settingsKey(options))) void processJob(job);
  }

  // ---- Settings -----------------------------------------------------------

  const qualityValue = h(
    'output',
    { class: 'quality-value', for: 'convert-quality' },
    options.quality,
  );
  const quality = h('input', {
    id: 'convert-quality',
    type: 'range',
    min: 1,
    max: 100,
    step: 1,
    value: options.quality,
    'aria-describedby': 'convert-quality-hint',
  });
  quality.addEventListener('input', () => {
    options.quality = Number(quality.value);
    qualityValue.textContent = quality.value;
    refresh();
  });

  const lossless = h('input', { id: 'convert-lossless', type: 'checkbox' });
  lossless.addEventListener('change', () => {
    options.lossless = lossless.checked;
    quality.disabled = lossless.checked;
    refresh();
  });

  const settings = h(
    'div',
    { class: 'settings' },
    h(
      'div',
      { class: 'field field-quality' },
      h('label', { for: 'convert-quality', class: 'label' }, 'Quality'),
      h('div', { class: 'range-row' }, quality, qualityValue),
      h(
        'p',
        { id: 'convert-quality-hint', class: 'hint' },
        '80 suits most photos. Lower makes smaller files with softer detail.',
      ),
    ),
    h(
      'div',
      { class: 'field field-lossless' },
      h('label', { class: 'check' }, lossless, h('span', {}, 'Lossless')),
      h('p', { class: 'hint' }, 'Exact pixels. Best for screenshots, logos and text.'),
    ),
  );

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

  /** Images converted with different settings. Files no setting can fix are left alone. */
  function staleJobs(): Job[] {
    const key = settingsKey(options);
    return store.jobs.filter(
      (j) => j.settingsKey !== key && !(j.error && UNFIXABLE.has(j.error.code)),
    );
  }

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
        downloadBlob(zip, zipFilename());
      } finally {
        zipping = false;
        refresh();
      }
    }
  });

  // ---- Rendering ----------------------------------------------------------

  const fileList = createFileList({
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

    // Status line
    const parts: (string | HTMLElement)[] = [];
    if (plan.kind === 'busy') {
      parts.push(`Converting… ${plan.finished} of ${plan.total} done`);
    } else {
      parts.push(`${done.length} ${done.length === 1 ? 'image' : 'images'} converted`);
    }
    if (done.length > 0) {
      parts.push(
        h(
          'span',
          { class: 'summary-sizes' },
          `${formatBytes(before)} → ${formatBytes(after)} (${savingLabel(before, after)})`,
        ),
      );
    }
    if (failed > 0)
      parts.push(h('span', { class: 'summary-failed' }, `${failed} couldn’t be converted`));
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

    // Offer to re-convert when the settings no longer match what was used
    const stale = staleJobs().length;
    applyButton.hidden = stale === 0;
    applyButton.textContent = `Apply new settings to ${stale} ${stale === 1 ? 'image' : 'images'}`;
  }

  store.subscribe(refresh);
  refresh();

  return h(
    'section',
    { class: 'tool', 'aria-label': 'Convert to WebP' },
    settings,
    createDropzone(addFiles),
    summary,
    fileList.element,
  );
}

function savingLabel(before: number, after: number): string {
  const saved = percentSaved(before, after);
  return saved >= 0 ? `${saved}% smaller` : `${-saved}% larger`;
}
