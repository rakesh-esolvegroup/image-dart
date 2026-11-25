import { outputFilename, PATTERN_TOKENS } from '../lib/filename';
import type { PrefsStore } from '../lib/prefs';
import type { OutputFormat } from '../worker/codecs';
import { h } from './dom';

const FORMATS: { value: OutputFormat; label: string; hint: string }[] = [
  { value: 'webp', label: 'WebP', hint: 'Fast and supported everywhere.' },
  {
    value: 'avif',
    label: 'AVIF',
    hint: 'Usually smaller than WebP, but slower to create. Loads a 3.4 MB encoder the first time.',
  },
];

/**
 * Output format and file-name pattern. Shared by both tabs: each tab shows its own copy,
 * bound to the same settings, so they always agree.
 */
export function createOutputFields(prefs: PrefsStore, idPrefix: string): HTMLElement {
  const patternId = `${idPrefix}-pattern`;
  const formatHint = h('p', { class: 'hint' });

  const formatButtons = FORMATS.map((f) =>
    h('button', { type: 'button', class: 'chip chip-format', 'aria-pressed': 'false' }, f.label),
  );
  formatButtons.forEach((b, i) =>
    b.addEventListener('click', () => prefs.set('output', { format: FORMATS[i].value })),
  );

  const pattern = h('input', {
    id: patternId,
    type: 'text',
    class: 'text-input',
    spellcheck: 'false',
    autocomplete: 'off',
    maxlength: 120,
    'aria-describedby': `${patternId}-hint`,
  });
  const example = h('code', { class: 'example' });
  pattern.addEventListener('input', () => {
    const value = pattern.value.trim() ? pattern.value : '{name}';
    prefs.set('output', { pattern: value });
  });
  pattern.addEventListener('blur', () => {
    if (!pattern.value.trim()) pattern.value = '{name}';
  });

  function sync(): void {
    const { format, pattern: p } = prefs.get().output;
    formatButtons.forEach((b, i) =>
      b.setAttribute('aria-pressed', String(FORMATS[i].value === format)),
    );
    formatHint.textContent = FORMATS.find((f) => f.value === format)!.hint;
    if (document.activeElement !== pattern) pattern.value = p;
    example.textContent = outputFilename(p, 'photo.jpg', {
      width: 1200,
      height: 800,
      quality: 80,
      format,
    });
  }
  prefs.subscribe((_, changed) => changed === 'output' && sync());
  sync();

  return h(
    'div',
    { class: 'settings settings-output' },
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'label', id: `${idPrefix}-format-label` }, 'Format'),
      h(
        'span',
        { class: 'chips', role: 'group', 'aria-labelledby': `${idPrefix}-format-label` },
        ...formatButtons,
      ),
      formatHint,
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { for: patternId, class: 'label' }, 'File names'),
      pattern,
      h(
        'p',
        { id: `${patternId}-hint`, class: 'hint' },
        'Use ',
        ...PATTERN_TOKENS.flatMap((t, i) => [i ? ' ' : '', h('code', {}, t)]),
        '. Example: ',
        example,
      ),
    ),
  );
}
