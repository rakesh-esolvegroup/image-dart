import './styles.css';

const tabs = [
  {
    id: 'convert',
    label: 'Convert to WebP',
    note: 'JPEG/PNG → WebP conversion is coming in Phase 2.',
  },
  {
    id: 'compress',
    label: 'Compress / Resize',
    note: 'Compress-to-target-size (e.g. 2 MB → 160 KB) is coming in Phase 3.',
  },
] as const;

type TabId = (typeof tabs)[number]['id'];

function render(root: HTMLElement, active: TabId): void {
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  root.innerHTML = `
    <main class="app">
      <h1>Image Tool</h1>
      <p class="tagline">Convert and compress images right in your browser.</p>
      <div class="tabs" role="tablist">
        ${tabs
          .map(
            (t) =>
              `<button role="tab" data-tab="${t.id}" aria-selected="${t.id === active}">${t.label}</button>`,
          )
          .join('')}
      </div>
      <section class="panel" role="tabpanel">${current.note}</section>
      <p class="privacy">🔒 Your images never leave your computer. All processing happens locally.</p>
    </main>
  `;
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => render(root, btn.dataset.tab as TabId));
  });
}

const root = document.querySelector<HTMLElement>('#app');
if (root) render(root, 'convert');
