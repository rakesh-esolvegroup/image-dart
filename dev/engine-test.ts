import { WorkerPool } from '../src/lib/workerPool';
import { ImageToolError } from '../src/lib/errors';
import { formatBytes, percentSaved, toWebpFilename } from '../src/lib/format';
import type { EngineProgress, ImageResult } from '../src/worker/engine';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pool = new WorkerPool();
const logEl = $<HTMLDivElement>('log');

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function log(line: string): void {
  logEl.textContent += `${new Date().toLocaleTimeString()}  ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function describeProgress(p: EngineProgress): string {
  if (p.stage === 'decode') return 'decoding';
  if (p.stage === 'resize') return `resizing to ${p.width}×${p.height}`;
  const q = p.quality === null ? 'lossless' : `q${p.quality}`;
  return `encode #${p.attempt} ${q}${p.bytes !== undefined ? ` → ${formatBytes(p.bytes)}` : ''}`;
}

function addRow(file: File): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.innerHTML = `<td>${escapeHtml(file.name)}<br><small>${formatBytes(file.size)}</small></td><td>processing…</td><td></td>`;
  $<HTMLTableSectionElement>('results').prepend(row);
  return row;
}

function showResult(row: HTMLTableRowElement, file: File, r: ImageResult): void {
  const url = URL.createObjectURL(new Blob([r.buffer], { type: r.mimeType }));
  const quality = r.lossless ? 'lossless' : `q${r.quality}`;
  row.cells[1].innerHTML = `
    <b>${formatBytes(r.inputBytes)} → ${formatBytes(r.outputBytes)}</b>
    (${percentSaved(r.inputBytes, r.outputBytes)}% smaller)<br>
    ${r.originalWidth}×${r.originalHeight} → ${r.width}×${r.height}${r.resized ? ' (resized)' : ''}<br>
    ${quality}, ${r.attempts} encode(s), ${r.durationMs} ms`;
  row.cells[2].innerHTML = `<img src="${url}" alt=""><br><a href="${url}" download="${escapeHtml(toWebpFilename(file.name))}">Download</a>`;
}

async function processAll(mode: 'convert' | 'compress'): Promise<void> {
  const files = Array.from($<HTMLInputElement>('files').files ?? []);
  if (files.length === 0) {
    log('Pick one or more files first.');
    return;
  }
  const quality = Number($<HTMLInputElement>('quality').value);
  const lossless = $<HTMLInputElement>('lossless').checked;
  const targetBytes = Number($<HTMLInputElement>('target').value) * 1024;
  const maxWidth = Number($<HTMLInputElement>('maxWidth').value) || undefined;

  const started = performance.now();
  await Promise.all(
    files.map(async (file) => {
      const row = addRow(file);
      const onProgress = (p: EngineProgress) => log(`${file.name}: ${describeProgress(p)}`);
      try {
        const result =
          mode === 'convert'
            ? await pool.convert(file, { quality, lossless }, onProgress)
            : await pool.compress(file, { targetBytes, maxWidth }, onProgress);
        showResult(row, file, result);
        log(`${file.name}: done`);
      } catch (err) {
        const code = err instanceof ImageToolError ? err.code : 'UNKNOWN';
        const message = err instanceof Error ? err.message : String(err);
        row.cells[1].innerHTML = `<span class="err">${code}: ${escapeHtml(message)}</span>`;
        log(`${file.name}: ${code} ${message}`);
      }
    }),
  );
  log(`All ${files.length} file(s) finished in ${Math.round(performance.now() - started)} ms`);
}

$<HTMLButtonElement>('convert').addEventListener('click', () => void processAll('convert'));
$<HTMLButtonElement>('compress').addEventListener('click', () => void processAll('compress'));
