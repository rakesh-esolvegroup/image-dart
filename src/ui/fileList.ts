import { formatBytes, percentSaved } from '../lib/format';
import type { ResultNote } from './describe';
import { h, replace } from './dom';
import type { Job } from './jobs';

interface Row {
  root: HTMLLIElement;
  thumb: HTMLImageElement;
  meta: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  marker: HTMLElement;
  before: HTMLElement;
  after: HTMLElement;
  saving: HTMLElement;
  actions: HTMLElement;
  /** Status the action buttons were built for; rebuilt only when it changes (keeps focus). */
  actionsFor?: string;
}

export interface FileListHandlers {
  /** Text under the file name once the image is done. */
  describe(job: Job): ResultNote;
  onCompare(job: Job): void;
  onDownload(job: Job): void;
  onRemove(job: Job): void;
}

/**
 * The list of added images. Each row shows the "shrink bar": the full track is the
 * original size and the filled part is the WebP size. In the Compress tab a tick marks
 * the target size, so the goal and the result show together.
 * Rows are keyed by job id and updated in place, so thumbnails don't flicker.
 */
export function createFileList(handlers: FileListHandlers) {
  const list = h('ul', { class: 'file-list', 'aria-label': 'Images' });
  const rows = new Map<string, Row>();

  function createRow(job: Job): Row {
    const thumb = h('img', { class: 'thumb', alt: '', src: job.inputUrl, decoding: 'async' });
    // Unsupported or damaged files: show an empty frame, not the browser's broken-image icon
    thumb.addEventListener('error', () => thumb.classList.add('is-broken'));
    thumb.addEventListener('load', () => thumb.classList.remove('is-broken'));
    const meta = h('span', { class: 'file-meta' });
    const fill = h('span', { class: 'shrink-fill' });
    const marker = h('span', { class: 'shrink-target' });
    const bar = h('span', { class: 'shrink-bar', 'aria-hidden': 'true' }, fill, marker);
    const before = h('span', { class: 'size size-before' });
    const after = h('span', { class: 'size size-after' });
    const saving = h('span', { class: 'saving' });
    const actions = h('span', { class: 'file-actions' });
    const root = h(
      'li',
      { class: 'file-row' },
      thumb,
      h(
        'span',
        { class: 'file-name' },
        h('span', { class: 'name', title: job.file.name }, job.file.name),
        meta,
      ),
      h('span', { class: 'shrink' }, bar, h('span', { class: 'sizes' }, before, after)),
      saving,
      actions,
    );
    return { root, thumb, meta, bar, fill, marker, before, after, saving, actions };
  }

  function updateRow(row: Row, job: Job): void {
    row.root.dataset.status = job.status;
    row.root.dataset.grew = 'false';
    row.before.textContent = formatBytes(job.file.size);
    row.meta.dataset.tone = 'normal';

    // Target marker (Compress tab): only meaningful when the target is below the original size
    const target = job.used?.targetBytes;
    const showMarker = !!target && target < job.file.size && job.status !== 'error';
    row.marker.hidden = !showMarker;
    if (target && showMarker) {
      row.marker.style.setProperty('--pos', String(target / job.file.size));
      row.bar.title = `Target: ${formatBytes(target)}`;
    } else {
      row.bar.removeAttribute('title');
    }

    if (job.status === 'done' && job.result) {
      const r = job.result;
      const ratio = r.outputBytes / Math.max(1, r.inputBytes);
      const saved = percentSaved(r.inputBytes, r.outputBytes);
      row.root.dataset.grew = String(ratio > 1);
      row.fill.style.setProperty('--ratio', String(Math.min(1, ratio)));
      row.after.textContent = formatBytes(r.outputBytes);
      row.saving.textContent = saved >= 0 ? `−${saved}%` : `+${-saved}%`;
      row.saving.setAttribute(
        'aria-label',
        saved >= 0 ? `${saved} percent smaller` : `${-saved} percent larger`,
      );
      const note = handlers.describe(job);
      row.meta.textContent = note.text;
      row.meta.dataset.tone = note.tone;
      if (job.outputUrl && row.thumb.src !== job.outputUrl) row.thumb.src = job.outputUrl;
      setActions(
        row,
        job,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small btn-ghost',
            onclick: () => handlers.onCompare(job),
            'aria-label': `Compare original and WebP for ${job.file.name}`,
          },
          'Compare',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            onclick: () => handlers.onDownload(job),
            'aria-label': `Download ${job.outputName}`,
          },
          'Download',
        ),
        removeButton(job),
      );
    } else if (job.status === 'error') {
      if (row.thumb.src !== job.inputUrl) row.thumb.src = job.inputUrl;
      row.fill.style.setProperty('--ratio', '0');
      row.after.textContent = '';
      row.saving.textContent = '';
      row.saving.removeAttribute('aria-label');
      row.meta.textContent = job.error?.message ?? 'Conversion failed.';
      setActions(row, job, removeButton(job));
    } else {
      // Back to the original while re-converting (the old WebP URL has been freed)
      if (row.thumb.src !== job.inputUrl) row.thumb.src = job.inputUrl;
      row.fill.style.setProperty('--ratio', '0');
      row.after.textContent = '';
      row.saving.textContent = '';
      row.saving.removeAttribute('aria-label');
      row.meta.textContent = job.status === 'queued' ? 'Waiting…' : (job.progress ?? 'Converting…');
      setActions(row, job, removeButton(job));
    }
  }

  function setActions(row: Row, job: Job, ...buttons: HTMLButtonElement[]): void {
    const key = `${job.status}:${job.run}`;
    if (row.actionsFor === key) return;
    row.actionsFor = key;
    replace(row.actions, ...buttons);
  }

  function removeButton(job: Job): HTMLButtonElement {
    return h(
      'button',
      {
        type: 'button',
        class: 'btn btn-icon',
        onclick: () => handlers.onRemove(job),
        'aria-label': `Remove ${job.file.name}`,
        title: 'Remove',
      },
      '×',
    );
  }

  function render(jobs: readonly Job[]): void {
    const ids = new Set(jobs.map((j) => j.id));
    for (const [id, row] of rows) {
      if (!ids.has(id)) {
        row.root.remove();
        rows.delete(id);
      }
    }
    jobs.forEach((job, index) => {
      let row = rows.get(job.id);
      if (!row) {
        row = createRow(job);
        rows.set(job.id, row);
      }
      // Move only when out of place: re-inserting a row would drop keyboard focus
      if (list.children[index] !== row.root)
        list.insertBefore(row.root, list.children[index] ?? null);
      updateRow(row, job);
    });
  }

  return { element: list, render };
}
