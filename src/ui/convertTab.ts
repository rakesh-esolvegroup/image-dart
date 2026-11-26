import { outputFilename } from '../lib/filename';
import type { PrefsStore } from '../lib/prefs';
import type { WorkerPool } from '../lib/workerPool';
import type { ConvertOptions, EngineProgress } from '../worker/engine';
import { createBatchTool } from './batchTool';
import { describeConvert } from './describe';
import { h } from './dom';
import { createOutputFields } from './outputFields';

function progressText(p: EngineProgress): string {
  return p.stage === 'decode' ? 'Reading image…' : 'Converting…';
}

const QUALITY_HINT = {
  webp: 'Lower quality makes smaller files. 80 suits most photos.',
  avif: 'AVIF looks good at lower numbers: 50–60 suits most photos.',
};

/** Feature 1: convert images to WebP or AVIF at a chosen quality, one or many at a time. */
export function createConvertTab(pool: WorkerPool, prefs: PrefsStore) {
  const saved = prefs.get().convert;

  const qualityValue = h(
    'output',
    { class: 'quality-value', for: 'convert-quality' },
    saved.quality,
  );
  const quality = h('input', {
    id: 'convert-quality',
    type: 'range',
    class: 'slider',
    min: 1,
    max: 100,
    step: 1,
    value: saved.quality,
    'aria-describedby': 'convert-quality-hint',
  });
  // The dark part of the track follows the thumb
  const syncFill = () =>
    quality.style.setProperty('--fill', `${((Number(quality.value) - 1) / 99) * 100}%`);
  quality.addEventListener('input', () => {
    qualityValue.textContent = quality.value;
    syncFill();
    prefs.set('convert', { quality: Number(quality.value) });
  });
  syncFill();

  const lossless = h('input', {
    id: 'convert-lossless',
    type: 'checkbox',
    role: 'switch',
    class: 'switch',
    checked: saved.lossless,
    'aria-describedby': 'convert-lossless-hint',
  });
  quality.disabled = saved.lossless;
  lossless.addEventListener('change', () => {
    quality.disabled = lossless.checked;
    prefs.set('convert', { lossless: lossless.checked });
  });

  const qualityHint = h('p', { id: 'convert-quality-hint', class: 'hint' });
  const output = createOutputFields(prefs, 'convert');

  const settings = h(
    'div',
    { class: 'settings-body' },
    output.format,
    h(
      'div',
      { class: 'field field-quality' },
      h(
        'div',
        { class: 'field-head' },
        h('label', { for: 'convert-quality', class: 'label' }, 'Quality'),
        qualityValue,
      ),
      quality,
      qualityHint,
    ),
    h(
      'div',
      { class: 'field field-divided' },
      h(
        'div',
        { class: 'field-head' },
        h('label', { for: 'convert-lossless', class: 'label' }, 'Lossless'),
        lossless,
      ),
      h(
        'p',
        { id: 'convert-lossless-hint', class: 'hint' },
        'Exact pixels. Best for screenshots, logos and text.',
      ),
    ),
    output.fileName,
  );

  const options = (): ConvertOptions => ({
    ...prefs.get().convert,
    format: prefs.get().output.format,
  });

  const tool = createBatchTool<ConvertOptions>({
    id: 'convert',
    label: 'Convert',
    title: 'Convert images',
    intro: 'Turn photos and graphics into WebP or AVIF.',
    verb: { doing: 'Converting', done: 'converted' },
    settings,
    getOptions: options,
    settingsKey: (o) => `${o.format}-${o.lossless ? 'lossless' : `q${o.quality}`}`,
    run: (file, o, onProgress) => pool.convert(file, o, onProgress),
    describe: (job) => describeConvert(job.result!),
    progressText,
    nameFor: (file, r) => outputFilename(prefs.get().output.pattern, file.name, r),
  });

  function syncHint(): void {
    qualityHint.textContent = QUALITY_HINT[prefs.get().output.format];
  }
  prefs.subscribe((_, changed) => {
    if (changed === 'output') {
      syncHint();
      tool.rename();
    }
    tool.refresh();
  });
  syncHint();

  return { element: tool.element, addFiles: tool.addFiles };
}
