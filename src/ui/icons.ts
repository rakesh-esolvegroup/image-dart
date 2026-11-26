/**
 * Line icons drawn for the Image Dart UI (24×24 grid, 1.75 stroke).
 * They are fixed strings in this file, never user input, so parsing them as markup is safe.
 * Presentation attributes only: the Content-Security-Policy blocks inline style="" attributes.
 */
const STROKE =
  'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  plane: `<path d="M2.5 10.4 21.5 2.5 9.7 13.1Z" fill="currentColor"/><path d="M9.7 13.1 21.5 2.5 15.3 21Z" fill="currentColor"/><path d="M9.7 13.1 10.3 19.6 12.7 16.2Z" fill="currentColor" opacity="0.55"/>`,
  lock: `<g ${STROKE}><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/><path d="M12 14.5v2"/></g>`,
  sliders: `<g ${STROKE}><path d="M3 6h18M3 12h18M3 18h18"/><circle class="icon-knob" cx="9" cy="6" r="2.25"/><circle class="icon-knob" cx="15.5" cy="12" r="2.25"/><circle class="icon-knob" cx="8" cy="18" r="2.25"/></g>`,
  check: `<path ${STROKE} stroke-width="2.25" d="M5 12.5 10 17.5 19 7"/>`,
  plus: `<path ${STROKE} stroke-width="2.5" d="M12 5v14M5 12h14"/>`,
  photos: `<g ${STROKE}><path d="M6.5 5.2 16.8 3.4l2.4 13.4"/><rect x="3" y="7" width="14" height="13" rx="1.5"/><rect x="5.5" y="9.5" width="9" height="7" rx="0.5"/><path d="m6 16.2 2.8-3.2 2 2.2 1.4-1.4 2.2 2.4"/><circle cx="12.4" cy="11.6" r="0.9" fill="currentColor"/></g>`,
  save: `<g ${STROKE}><path d="M12 3.5v10.5M7.5 9.5 12 14l4.5-4.5"/><path d="M4 13.5v4.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5"/></g>`,
  arrow: `<path ${STROKE} d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>`,
} as const;

export type IconName = keyof typeof ICONS;

/** Returns a decorative (aria-hidden) SVG icon element. */
export function icon(name: IconName, className = ''): SVGSVGElement {
  const template = document.createElement('template');
  template.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="icon ${className}">${ICONS[name]}</svg>`;
  return template.content.firstElementChild as SVGSVGElement;
}
