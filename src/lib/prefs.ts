import type { OutputFormat } from '../worker/codecs';
import { DEFAULT_PATTERN } from './filename';

/** Everything the user can set. Saved in this browser and restored on the next visit. */
export interface Prefs {
  convert: { quality: number; lossless: boolean };
  compress: { targetKb: number; maxWidth?: number };
  output: { format: OutputFormat; pattern: string };
}

export const DEFAULT_PREFS: Prefs = {
  convert: { quality: 80, lossless: false },
  compress: { targetKb: 160 },
  output: { format: 'webp', pattern: DEFAULT_PATTERN },
};

export const MAX_WIDTHS = [800, 1200, 1600, 1920] as const;
const STORAGE_KEY = 'image-tool:prefs:v1';

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Reads saved prefs, keeping only values that are still valid. Anything missing,
 * corrupt or out of range falls back to the default, so a bad value can't break the app.
 */
export function parsePrefs(raw: string | null): Prefs {
  let data: Record<string, Record<string, unknown> | undefined> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') data = parsed as typeof data;
  } catch {
    // corrupt JSON → defaults
  }
  const c = data.convert ?? {};
  const k = data.compress ?? {};
  const o = data.output ?? {};
  const d = DEFAULT_PREFS;
  return {
    convert: {
      quality: isInt(c.quality, 1, 100) ? c.quality : d.convert.quality,
      lossless: typeof c.lossless === 'boolean' ? c.lossless : d.convert.lossless,
    },
    compress: {
      targetKb: isInt(k.targetKb, 5, 50_000) ? k.targetKb : d.compress.targetKb,
      maxWidth: MAX_WIDTHS.includes(k.maxWidth as (typeof MAX_WIDTHS)[number])
        ? (k.maxWidth as number)
        : undefined,
    },
    output: {
      format: o.format === 'avif' ? 'avif' : 'webp',
      pattern:
        typeof o.pattern === 'string' && o.pattern.trim() && o.pattern.length <= 120
          ? o.pattern
          : d.output.pattern,
    },
  };
}

type Listener = (prefs: Prefs, changed: keyof Prefs) => void;

/** Shared, persisted settings. Both tabs read from it and subscribe to changes. */
export class PrefsStore {
  private value: Prefs;
  private readonly listeners = new Set<Listener>();
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()) {
    this.storage = storage;
    let raw: string | null = null;
    try {
      raw = storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      // storage blocked (e.g. privacy mode) → defaults
    }
    this.value = parsePrefs(raw);
  }

  get(): Prefs {
    return this.value;
  }

  set<K extends keyof Prefs>(section: K, patch: Partial<Prefs[K]>): void {
    this.value = { ...this.value, [section]: { ...this.value[section], ...patch } };
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.value));
    } catch {
      // quota or privacy mode: settings just won't be remembered
    }
    for (const fn of this.listeners) fn(this.value, section);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
