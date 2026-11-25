import { h } from './dom';

const PASTE_KEY = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘V' : 'Ctrl+V';
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
    { type: 'button', class: 'btn btn-primary', onclick: pick },
    'Choose images',
  );

  const zone = h(
    'div',
    { class: 'dropzone' },
    h('p', { class: 'dropzone-title' }, 'Drop images here'),
    h(
      'p',
      { class: 'dropzone-hint' },
      `PNG, JPEG, WebP or AVIF. One or many, or paste with ${PASTE_KEY}.`,
    ),
    button,
    input,
  );

  // Clicking empty space in the zone opens the picker too (but not a second time via the button)
  zone.addEventListener('click', (e) => {
    if (e.target === zone || (e.target as Element).closest('.dropzone-title, .dropzone-hint'))
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
