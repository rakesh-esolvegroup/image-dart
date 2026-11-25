import { outputFilename } from '../lib/filename';
import { MAX_WIDTHS, type PrefsStore } from '../lib/prefs';
import type { WorkerPool } from '../lib/workerPool';
import type { CompressOptions, EngineProgress } from '../worker/engine';
import { createBatchTool } from './batchTool';
import { describeCompress } from './describe';
import { h } from './dom';
import { createOutputFields } from './outputFields';

const KB = 1024;
const TARGET_PRESETS = [100, 160, 250, 500];
const MIN_KB = 5;
const MAX_KB = 50_000;
const TARGET_HINT =
  'Each image gets the highest quality that fits. Too big even then? It’s resized to fit.';

function progressText(p: EngineProgress): string {
  if (p.stage === 'decode') return 'Reading image…';
  if (p.stage === 'resize') return `Resizing to ${p.width}×${p.height}…`;
  // Each attempt is one step of the quality search
  return `Trying quality ${p.quality}…`;
}

/** Feature 2: shrink images to fit a file size, e.g. 2 MB → 160 KB, one or many at a time. */
export function createCompressTab(pool: WorkerPool, prefs: PrefsStore) {
  const saved = prefs.get().compress;

  // ---- Target size --------------------------------------------------------

  const targetInput = h('input', {
    id: 'compress-target',
    type: 'number',
    inputmode: 'numeric',
    min: MIN_KB,
    max: MAX_KB,
    step: 1,
    value: saved.targetKb,
    class: 'number-input',
    'aria-describedby': 'compress-target-hint',
  });
  const targetHint = h('p', { id: 'compress-target-hint', class: 'hint' }, TARGET_HINT);
  const presets = TARGET_PRESETS.map((kb) =>
    h(
      'button',
      { type: 'button', class: 'chip', 'aria-pressed': String(kb === saved.targetKb) },
      `${kb} KB`,
    ),
  );

  function setTarget(kb: number, fromInput = false): void {
    const valid = Number.isInteger(kb) && kb >= MIN_KB && kb <= MAX_KB;
    targetInput.setAttribute('aria-invalid', String(!valid));
    targetHint.classList.toggle('hint-error', !valid);
    targetHint.textContent = valid
      ? TARGET_HINT
      : `Enter a whole number from ${MIN_KB} to ${MAX_KB.toLocaleString('en-US')} KB.`;
    if (!valid) return; // keep the last valid target
    if (!fromInput) targetInput.value = String(kb);
    presets.forEach((p, i) => p.setAttribute('aria-pressed', String(TARGET_PRESETS[i] === kb)));
    prefs.set('compress', { targetKb: kb });
  }

  targetInput.addEventListener('input', () => setTarget(Number(targetInput.value), true));
  // Leaving the field with an invalid number puts back the target that's actually in use
  targetInput.addEventListener('blur', () => {
    if (targetInput.getAttribute('aria-invalid') === 'true')
      setTarget(prefs.get().compress.targetKb);
  });
  presets.forEach((p, i) => p.addEventListener('click', () => setTarget(TARGET_PRESETS[i])));

  // ---- Max width ----------------------------------------------------------

  const widthSelect = h(
    'select',
    { id: 'compress-width', class: 'select', 'aria-describedby': 'compress-width-hint' },
    h('option', { value: '' }, 'Keep original'),
    ...MAX_WIDTHS.map((w) => h('option', { value: w, selected: w === saved.maxWidth }, `${w} px`)),
  );
  widthSelect.addEventListener('change', () => {
    prefs.set('compress', { maxWidth: widthSelect.value ? Number(widthSelect.value) : undefined });
  });

  const settings = h(
    'div',
    { class: 'settings-stack' },
    h(
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
    ),
    createOutputFields(prefs, 'compress'),
  );

  type Options = CompressOptions & { targetKb: number };
  const options = (): Options => {
    const { targetKb, maxWidth } = prefs.get().compress;
    return { targetKb, targetBytes: targetKb * KB, maxWidth, format: prefs.get().output.format };
  };

  const tool = createBatchTool<Options>({
    label: 'Compress to a target size',
    verb: { doing: 'Compressing', done: 'compressed' },
    settings,
    getOptions: options,
    settingsKey: (o) => `${o.format}-${o.targetKb}kb-${o.maxWidth ?? 'orig'}`,
    run: (file, o, onProgress) =>
      pool.compress(
        file,
        { targetBytes: o.targetBytes, maxWidth: o.maxWidth, format: o.format },
        onProgress,
      ),
    used: (o) => ({ targetBytes: o.targetBytes, maxWidth: o.maxWidth }),
    describe: (job) => describeCompress(job.result!, job.used),
    progressText,
    nameFor: (file, r) => outputFilename(prefs.get().output.pattern, file.name, r),
  });

  prefs.subscribe((_, changed) => {
    if (changed === 'output') tool.rename();
    tool.refresh();
  });

  return { element: tool.element, addFiles: tool.addFiles };
}
