import './styles.css';
import { WorkerPool } from './lib/workerPool';
import { h } from './ui/dom';
import { createConvertTab } from './ui/convertTab';
import { preventWindowDrop } from './ui/dropzone';

const pool = new WorkerPool();

interface Tab {
  id: string;
  label: string;
  panel: HTMLElement;
}

function createCompressPlaceholder(): HTMLElement {
  return h(
    'section',
    { class: 'tool tool-placeholder' },
    h('p', { class: 'placeholder-title' }, 'Compress to a target size'),
    h(
      'p',
      { class: 'hint' },
      'Pick a size like 160 KB and the image is shrunk to fit. Coming in the next update.',
    ),
  );
}

function createTabs(tabs: Tab[]): HTMLElement {
  const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Tools' });
  const panels = h('div', { class: 'panels' });

  const buttons = tabs.map((tab) =>
    h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${tab.id}`,
        'aria-controls': `panel-${tab.id}`,
        class: 'tab',
      },
      tab.label,
    ),
  );

  tabs.forEach((tab, i) => {
    const panel = h(
      'div',
      { role: 'tabpanel', id: `panel-${tab.id}`, 'aria-labelledby': `tab-${tab.id}` },
      tab.panel,
    );
    panels.append(panel);
    buttons[i].addEventListener('click', () => select(i));
    // Arrow keys move between tabs (WAI-ARIA tabs pattern)
    buttons[i].addEventListener('keydown', (e) => {
      const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!move) return;
      e.preventDefault();
      const next = (i + move + tabs.length) % tabs.length;
      select(next);
      buttons[next].focus();
    });
  });

  // Panels stay in the DOM when hidden, so work in one tab survives switching tabs
  function select(index: number): void {
    buttons.forEach((b, i) => {
      const active = i === index;
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
      (panels.children[i] as HTMLElement).hidden = !active;
    });
  }

  list.append(...buttons);
  select(0);
  return h('div', { class: 'tabbed' }, list, panels);
}

function createApp(): HTMLElement {
  return h(
    'div',
    { class: 'app' },
    h(
      'header',
      { class: 'masthead' },
      h('h1', { class: 'wordmark' }, 'Image Tool'),
      h(
        'p',
        { class: 'tagline' },
        'Convert and shrink images on your own computer. Nothing is uploaded.',
      ),
    ),
    h(
      'main',
      {},
      createTabs([
        { id: 'convert', label: 'Convert to WebP', panel: createConvertTab(pool) },
        { id: 'compress', label: 'Compress / Resize', panel: createCompressPlaceholder() },
      ]),
    ),
    h(
      'footer',
      { class: 'footnote' },
      'Images are processed in this browser tab and never leave your device.',
    ),
  );
}

preventWindowDrop();
document.querySelector('#app')?.replaceWith(createApp());
