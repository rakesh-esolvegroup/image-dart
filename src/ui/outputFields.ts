import { outputFilename, PATTERN_TOKENS } from '../lib/filename';
import type { PrefsStore } from '../lib/prefs';
import type { OutputFormat } from '../worker/codecs';
import { h } from './dom';
import { icon } from './icons';

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
];

const AVIF_NOTE =
  'Usually smaller than WebP, but slower to create. Loads a 3.4 MB encoder the first time.';

/**
 * Output format and file-name pattern. Shared by both tabs: each tab shows its own copy,
 * bound to the same settings, so they always agree. Returned separately so each tab can
 * place them in its own settings card.
 */
export function createOutputFields(prefs: PrefsStore, idPrefix: string) {
  const patternId = `${idPrefix}-pattern`;
  const formatLabelId = `${idPrefix}-format-label`;

  // ---- Format: two-option segmented control ------------------------------

  const formatButtons = FORMATS.map((f) =>
    h(
      'button',
      { type: 'button', class: 'segment', 'aria-pressed': 'false' },
      icon('check', 'segment-check'),
      h('span', {}, f.label),
    ),
  );
  formatButtons.forEach((b, i) =>
    b.addEventListener('click', () => prefs.set('output', { format: FORMATS[i].value })),
  );

  // The AVIF note opens smoothly instead of pushing the card around
  const avifNote = h(
    'div',
    { class: 'collapsible', 'data-open': 'false' },
    h('div', { class: 'collapsible-inner' }, h('p', { class: 'hint' }, AVIF_NOTE)),
  );

  const format = h(
    'div',
    { class: 'field' },
    h('span', { class: 'label', id: formatLabelId }, 'Format'),
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-labelledby': formatLabelId },
      ...formatButtons,
    ),
    avifNote,
  );

  // ---- File name pattern ---------------------------------------------------

  const pattern = h('input', {
    id: patternId,
    type: 'text',
    class: 'text-input',
    spellcheck: 'false',
    autocomplete: 'off',
    maxlength: 120,
    'aria-describedby': `${patternId}-preview ${patternId}-hint`,
  });
  const suffix = h('span', { class: 'input-suffix', 'aria-hidden': 'true' });
  const example = h('strong', { class: 'example' });
  pattern.addEventListener('input', () => {
    const value = pattern.value.trim() ? pattern.value : '{name}';
    prefs.set('output', { pattern: value });
  });
  pattern.addEventListener('blur', () => {
    if (!pattern.value.trim()) pattern.value = '{name}';
  });

  const fileName = h(
    'div',
    { class: 'field field-divided' },
    h('label', { for: patternId, class: 'label' }, 'File name'),
    h('div', { class: 'input-group' }, pattern, suffix),
    h('p', { id: `${patternId}-preview`, class: 'hint hint-preview' }, 'Preview: ', example),
    h(
      'p',
      { id: `${patternId}-hint`, class: 'hint' },
      'Add ',
      ...PATTERN_TOKENS.filter((t) => t !== '{name}').flatMap((t, i) => [
        i ? ' ' : '',
        h('code', {}, t),
      ]),
      ' to the name if you like.',
    ),
  );

  function sync(): void {
    const { format: f, pattern: p } = prefs.get().output;
    formatButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(FORMATS[i].value === f)));
    avifNote.dataset.open = String(f === 'avif');
    suffix.textContent = `.${f}`;
    if (document.activeElement !== pattern) pattern.value = p;
    example.textContent = outputFilename(p, 'photo.jpg', {
      width: 1200,
      height: 800,
      quality: 80,
      format: f,
    });
  }
  prefs.subscribe((_, changed) => changed === 'output' && sync());
  sync();

  return { format, fileName };
}
