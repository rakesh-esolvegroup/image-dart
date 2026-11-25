import { formatBytes, percentSaved } from '../lib/format';
import { h } from './dom';
import type { Job } from './jobs';

/**
 * Before/after comparison in a modal dialog. The new image is laid over the original and
 * revealed up to a draggable divider. "Fit" shows the whole image; "100%" shows real
 * pixels (scroll to pan), which is where compression artefacts become visible.
 */
export function openCompare(job: Job): void {
  const r = job.result;
  if (!r || !job.outputUrl) return;

  const titleId = `compare-title-${job.id}`;
  const before = h('img', { class: 'compare-img', src: job.inputUrl, alt: 'Original' });
  const label = r.format.toUpperCase();
  const after = h('img', { class: 'compare-img', src: job.outputUrl, alt: label });
  const afterLayer = h('div', { class: 'compare-after' }, after);
  const handle = h('div', { class: 'compare-handle', 'aria-hidden': 'true' });
  const canvas = h(
    'div',
    { class: 'compare-canvas' },
    before,
    afterLayer,
    handle,
    h(
      'span',
      { class: 'compare-tag compare-tag-before' },
      `Original · ${formatBytes(r.inputBytes)}`,
    ),
    h(
      'span',
      { class: 'compare-tag compare-tag-after' },
      `${label} · ${formatBytes(r.outputBytes)}`,
    ),
  );
  const stage = h('div', { class: 'compare-stage', 'data-zoom': 'fit' }, canvas);

  // Both images are drawn at the original's size, so a resized output is scaled up
  // to match. That shows exactly what was lost.
  canvas.style.setProperty('--w', String(r.originalWidth));
  canvas.style.setProperty('--h', String(r.originalHeight));

  const slider = h('input', {
    type: 'range',
    min: 0,
    max: 100,
    step: 1,
    value: 50,
    class: 'compare-range',
    'aria-label': `Divider position: left shows the original, right shows the ${label}`,
  });

  function setPosition(percent: number): void {
    const p = Math.min(100, Math.max(0, percent));
    canvas.style.setProperty('--pos', `${p}%`);
    slider.value = String(Math.round(p));
  }
  setPosition(50);
  slider.addEventListener('input', () => setPosition(Number(slider.value)));

  // Drag anywhere on the image to move the divider
  const fromPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    setPosition(((e.clientX - rect.left) / rect.width) * 100);
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    fromPointer(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (canvas.hasPointerCapture(e.pointerId)) fromPointer(e);
  });

  const fitButton = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'true' }, 'Fit');
  const actualButton = h(
    'button',
    { type: 'button', class: 'chip', 'aria-pressed': 'false' },
    '100%',
  );
  function setZoom(zoom: 'fit' | 'actual'): void {
    stage.dataset.zoom = zoom;
    fitButton.setAttribute('aria-pressed', String(zoom === 'fit'));
    actualButton.setAttribute('aria-pressed', String(zoom === 'actual'));
    if (zoom === 'actual') {
      // Centre the divider in view
      stage.scrollLeft = (canvas.scrollWidth - stage.clientWidth) * (Number(slider.value) / 100);
      stage.scrollTop = (canvas.scrollHeight - stage.clientHeight) / 2;
    }
  }
  fitButton.addEventListener('click', () => setZoom('fit'));
  actualButton.addEventListener('click', () => setZoom('actual'));

  const saved = percentSaved(r.inputBytes, r.outputBytes);
  const details = [
    `${formatBytes(r.inputBytes)} → ${formatBytes(r.outputBytes)}`,
    saved >= 0 ? `${saved}% smaller` : `${-saved}% larger`,
    r.lossless ? 'lossless' : `quality ${r.quality}`,
    r.resized
      ? `${r.originalWidth}×${r.originalHeight} → ${r.width}×${r.height}`
      : `${r.width}×${r.height}`,
  ].join(' · ');

  const closeButton = h(
    'button',
    { type: 'button', class: 'btn btn-icon compare-close', 'aria-label': 'Close' },
    '×',
  );

  const dialog = h(
    'dialog',
    { class: 'compare', 'aria-labelledby': titleId },
    h(
      'header',
      { class: 'compare-head' },
      h(
        'div',
        { class: 'compare-title' },
        h('h2', { id: titleId }, job.file.name),
        h('p', { class: 'compare-details' }, details),
      ),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Zoom' }, fitButton, actualButton),
      closeButton,
    ),
    stage,
    h('div', { class: 'compare-foot' }, h('span', {}, 'Original'), slider, h('span', {}, label)),
  );

  closeButton.addEventListener('click', () => dialog.close());
  // Click on the dimmed backdrop closes; Escape closes natively
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());

  document.body.append(dialog);
  dialog.showModal();
  slider.focus();
}
