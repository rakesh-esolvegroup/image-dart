import './styles.css';
import { pastedImages } from './lib/paste';
import { PrefsStore } from './lib/prefs';
import { WorkerPool } from './lib/workerPool';
import { createCompressTab } from './ui/compressTab';
import { createConvertTab } from './ui/convertTab';
import { h } from './ui/dom';
import { preventWindowDrop } from './ui/dropzone';
import { icon, type IconName } from './ui/icons';

// One pool shared by both tabs, so the two never compete for more cores than intended
const pool = new WorkerPool();
const prefs = new PrefsStore();

interface Tab {
  id: string;
  label: string;
  panel: HTMLElement;
  addFiles(files: File[]): void;
}

function createTabs(tabs: Tab[]) {
  const list = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Tools' });
  const panels = h('div', { class: 'panels' });
  let active = 0;

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
    active = index;
    buttons.forEach((b, i) => {
      const isActive = i === index;
      b.setAttribute('aria-selected', String(isActive));
      b.tabIndex = isActive ? 0 : -1;
      (panels.children[i] as HTMLElement).hidden = !isActive;
    });
  }

  list.append(...buttons);
  select(0);
  return {
    list,
    panels,
    /** Sends files to whichever tab is showing (used by paste). */
    addToActive: (files: File[]) => tabs[active].addFiles(files),
  };
}

function createApp(): HTMLElement {
  const convert = createConvertTab(pool, prefs);
  const compress = createCompressTab(pool, prefs);
  const tabs = createTabs([
    { id: 'convert', label: 'Convert', panel: convert.element, addFiles: convert.addFiles },
    {
      id: 'compress',
      label: 'Compress / Resize',
      panel: compress.element,
      addFiles: compress.addFiles,
    },
  ]);

  // Paste an image from the clipboard (a screenshot, or a copied image) into the open tab
  window.addEventListener('paste', (e) => {
    const files = pastedImages(e.clipboardData);
    if (files.length === 0) return; // plain text: let inputs handle it normally
    e.preventDefault();
    tabs.addToActive(files);
  });

  return h(
    'div',
    { class: 'app' },
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, icon('plane', 'brand-mark'), h('span', {}, 'Image Dart')),
      h('span', { class: 'topbar-divider', 'aria-hidden': 'true' }),
      tabs.list,
      h(
        'p',
        {
          class: 'device-note',
          title: 'Images are processed in this browser tab and never uploaded.',
        },
        icon('lock'),
        h('span', { class: 'device-note-text' }, 'Runs on your device'),
      ),
    ),
    h('main', { class: 'page' }, tabs.panels, howItWorks()),
    h(
      'footer',
      { class: 'footnote' },
      'Images are processed in this browser tab and never leave your device. ',
      'After the first visit it also works offline.',
    ),
  );
}

function howItWorks(): HTMLElement {
  const steps: [IconName, string][] = [
    ['photos', 'Add images'],
    ['sliders', 'Adjust settings'],
    ['save', 'Save files'],
  ];
  return h(
    'section',
    { class: 'how', 'aria-labelledby': 'how-title' },
    h('h2', { class: 'how-title', id: 'how-title' }, 'How it works'),
    h(
      'ol',
      { class: 'how-steps' },
      ...steps.map(([name, text], i) =>
        h(
          'li',
          { class: 'how-step' },
          icon(name, 'how-icon'),
          h('span', {}, text),
          i < steps.length - 1 && icon('arrow', 'how-arrow'),
        ),
      ),
    ),
  );
}

preventWindowDrop();
document.querySelector('#app')?.replaceWith(createApp());

// Offline support: cache the app after the first visit (production builds only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline mode is a bonus; the tool works fine without it
    });
  });
}
