import dogUrl from '../assets/dart-dog.webp';
import { h } from './dom';
import { icon } from './icons';

const PASTE_MODIFIER = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';
const ACCEPT = '.png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif';

/**
 * Drag-and-drop area plus a file picker. Accepts several files at once.
 * Unsupported files are passed through too, so they can be listed with a clear error
 * instead of silently disappearing.
 */
export function createDropzone(onFiles: (files: File[]) => void): HTMLElement {
  const input = h('input', {
    type: 'file',
    accept: ACCEPT,
    multiple: true,
    class: 'visually-hidden',
    tabindex: -1,
    'aria-hidden': 'true',
  });
  input.addEventListener('change', () => {
    if (input.files?.length) onFiles(Array.from(input.files));
    input.value = ''; // allow choosing the same file again
  });

  const pick = () => input.click();
  const button = h(
    'button',
    { type: 'button', class: 'btn btn-primary btn-pill btn-choose', onclick: pick },
    icon('plus'),
    'Choose images',
  );

  // Dart, the mascot, carrying a photo. Decorative: the text below says what to do.
  const art = h(
    'div',
    { class: 'dropzone-art', 'aria-hidden': 'true' },
    h('span', { class: 'dropzone-dots' }),
    h(
      'span',
      { class: 'dog-float' },
      h('img', {
        class: 'dog',
        src: dogUrl,
        alt: '',
        width: 560,
        height: 521,
        draggable: 'false',
      }),
    ),
    h('span', { class: 'dog-shadow' }),
  );

  const zone = h(
    'div',
    { class: 'dropzone' },
    art,
    h('p', { class: 'dropzone-title' }, 'Drop images here'),
    h('p', { class: 'dropzone-formats' }, 'PNG, JPEG, WebP or AVIF. One or many.'),
    button,
    h(
      'p',
      { class: 'dropzone-paste' },
      'or paste with ',
      h('kbd', {}, PASTE_MODIFIER),
      ' + ',
      h('kbd', {}, 'V'),
    ),
    input,
  );

  // Clicking anywhere in the zone opens the picker, except the button (it already does) and
  // the hidden input itself (its own click bubbles up here)
  zone.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target === input || target.closest('button')) return;
    pick();
  });

  let depth = 0; // dragenter/leave fire for every child element
  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('is-over');
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('is-over');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) onFiles(files);
  });

  return zone;
}

/** Stops the browser from opening an image when it's dropped outside the drop zone. */
export function preventWindowDrop(): void {
  for (const type of ['dragover', 'drop'] as const) {
    window.addEventListener(type, (e) => {
      if (!(e.target as Element | null)?.closest?.('.dropzone')) e.preventDefault();
    });
  }
}
