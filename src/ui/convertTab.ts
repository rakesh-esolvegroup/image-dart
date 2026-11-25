import type { WorkerPool } from '../lib/workerPool';
import type { ConvertOptions, EngineProgress } from '../worker/engine';
import { createBatchTool } from './batchTool';
import { describeConvert } from './describe';
import { h } from './dom';

function progressText(p: EngineProgress): string {
  if (p.stage === 'decode') return 'Reading image…';
  return 'Converting to WebP…';
}

/** Feature 1: convert PNG/JPEG images to WebP at a chosen quality, one or many at a time. */
export function createConvertTab(pool: WorkerPool): HTMLElement {
  const options: ConvertOptions = { quality: 80, lossless: false };

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
    tool.refresh();
  });

  const lossless = h('input', { id: 'convert-lossless', type: 'checkbox' });
  lossless.addEventListener('change', () => {
    options.lossless = lossless.checked;
    quality.disabled = lossless.checked;
    tool.refresh();
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

  const tool = createBatchTool<ConvertOptions>({
    label: 'Convert to WebP',
    verb: { doing: 'Converting', done: 'converted' },
    settings,
    getOptions: () => ({ ...options }),
    settingsKey: (o) => (o.lossless ? 'lossless' : `q${o.quality}`),
    run: (file, o, onProgress) => pool.convert(file, o, onProgress),
    describe: (job) => describeConvert(job.result!),
    progressText,
  });

  return tool.element;
}
