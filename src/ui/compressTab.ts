import type { WorkerPool } from '../lib/workerPool';
import type { CompressOptions, EngineProgress } from '../worker/engine';
import { createBatchTool } from './batchTool';
import { describeCompress } from './describe';
import { h } from './dom';

const KB = 1024;
const TARGET_PRESETS = [100, 160, 250, 500];
const WIDTH_OPTIONS = [800, 1200, 1600, 1920];
const MIN_KB = 5;
const MAX_KB = 50_000;

function progressText(p: EngineProgress): string {
  if (p.stage === 'decode') return 'Reading image…';
  if (p.stage === 'resize') return `Resizing to ${p.width}×${p.height}…`;
  // Each attempt is one step of the quality search
  return `Trying quality ${p.quality}…`;
}

/** Feature 2: shrink images to fit a file size, e.g. 2 MB → 160 KB, one or many at a time. */
export function createCompressTab(pool: WorkerPool): HTMLElement {
  const options: { targetKb: number; maxWidth?: number } = { targetKb: 160 };

  // ---- Target size --------------------------------------------------------

  const targetInput = h('input', {
    id: 'compress-target',
    type: 'number',
    inputmode: 'numeric',
    min: MIN_KB,
    max: MAX_KB,
    step: 1,
    value: options.targetKb,
    class: 'number-input',
    'aria-describedby': 'compress-target-hint',
  });
  const targetHint = h(
    'p',
    { id: 'compress-target-hint', class: 'hint' },
    'Each image gets the highest quality that fits. Too big even then? It’s resized to fit.',
  );
  const presets = TARGET_PRESETS.map((kb) =>
    h(
      'button',
      { type: 'button', class: 'chip', 'aria-pressed': String(kb === options.targetKb) },
      `${kb} KB`,
    ),
  );

  function setTarget(kb: number, fromInput = false): void {
    const valid = Number.isInteger(kb) && kb >= MIN_KB && kb <= MAX_KB;
    targetInput.setAttribute('aria-invalid', String(!valid));
    targetHint.classList.toggle('hint-error', !valid);
    targetHint.textContent = valid
      ? 'Each image gets the highest quality that fits. Too big even then? It’s resized to fit.'
      : `Enter a whole number from ${MIN_KB} to ${MAX_KB.toLocaleString()} KB.`;
    if (!valid) return; // keep the last valid target
    options.targetKb = kb;
    if (!fromInput) targetInput.value = String(kb);
    presets.forEach((p, i) => p.setAttribute('aria-pressed', String(TARGET_PRESETS[i] === kb)));
    tool.refresh();
  }

  targetInput.addEventListener('input', () => setTarget(Number(targetInput.value), true));
  // Leaving the field with an invalid number puts back the target that's actually in use
  targetInput.addEventListener('blur', () => {
    if (targetInput.getAttribute('aria-invalid') === 'true') setTarget(options.targetKb);
  });
  presets.forEach((p, i) => p.addEventListener('click', () => setTarget(TARGET_PRESETS[i])));

  // ---- Max width ----------------------------------------------------------

  const widthSelect = h(
    'select',
    { id: 'compress-width', class: 'select', 'aria-describedby': 'compress-width-hint' },
    h('option', { value: '' }, 'Keep original'),
    ...WIDTH_OPTIONS.map((w) => h('option', { value: w }, `${w} px`)),
  );
  widthSelect.addEventListener('change', () => {
    options.maxWidth = widthSelect.value ? Number(widthSelect.value) : undefined;
    tool.refresh();
  });

  const settings = h(
    'div',
    { class: 'settings' },
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'compress-target', class: 'label' }, 'Target size'),
      h(
        'div',
        { class: 'target-row' },
        h('span', { class: 'number-field' }, targetInput, h('span', { class: 'unit' }, 'KB')),
        h('span', { class: 'chips', role: 'group', 'aria-label': 'Common sizes' }, ...presets),
      ),
      targetHint,
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'compress-width', class: 'label' }, 'Max width'),
      widthSelect,
      h(
        'p',
        { id: 'compress-width-hint', class: 'hint' },
        'Wider images are scaled down first. Height follows.',
      ),
    ),
  );

  const toEngine = (o: typeof options): CompressOptions => ({
    targetBytes: o.targetKb * KB,
    maxWidth: o.maxWidth,
  });

  const tool = createBatchTool<typeof options>({
    label: 'Compress to a target size',
    verb: { doing: 'Compressing', done: 'compressed' },
    settings,
    getOptions: () => ({ ...options }),
    settingsKey: (o) => `${o.targetKb}kb-${o.maxWidth ?? 'orig'}`,
    run: (file, o, onProgress) => pool.compress(file, toEngine(o), onProgress),
    used: (o) => toEngine(o),
    describe: (job) => describeCompress(job.result!, job.used),
    progressText,
  });

  return tool.element;
}
