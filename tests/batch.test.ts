import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { buildZip, uniqueNames, zipFilename } from '../src/lib/zip';
import { JobStore, planDownload, type Job } from '../src/ui/jobs';

const file = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name);

/** Builds jobs in a given state without running the real converter. */
function jobs(...states: Array<Job['status']>): Job[] {
  const store = new JobStore();
  const added = store.add(
    states.map((_, i) => file(`photo-${i + 1}.png`)),
    'q80',
  );
  added.forEach((job, i) => {
    const status = states[i];
    store.update(job.id, {
      status,
      blob: status === 'done' ? new Blob([`webp-${i}`], { type: 'image/webp' }) : undefined,
    });
  });
  return [...store.jobs];
}

describe('planDownload: one image → .webp, several → .zip', () => {
  it('offers nothing when the list is empty', () => {
    expect(planDownload([])).toEqual({ kind: 'none' });
  });

  it('waits while any image is still converting', () => {
    expect(planDownload(jobs('done', 'processing', 'queued'))).toEqual({
      kind: 'busy',
      finished: 1,
      total: 3,
    });
  });

  it('downloads a single image directly, not as a zip', () => {
    const plan = planDownload(jobs('done'));
    expect(plan.kind).toBe('single');
    if (plan.kind === 'single') expect(plan.job.outputName).toBe('photo-1.webp');
  });

  it('zips two or more finished images', () => {
    const plan = planDownload(jobs('done', 'done', 'done'));
    expect(plan.kind).toBe('zip');
    if (plan.kind === 'zip') expect(plan.jobs).toHaveLength(3);
  });

  it('counts only images that converted successfully', () => {
    expect(planDownload(jobs('done', 'error')).kind).toBe('single');
    expect(planDownload(jobs('done', 'error', 'done')).kind).toBe('zip');
    expect(planDownload(jobs('error', 'error'))).toEqual({ kind: 'none' });
  });
});

describe('uniqueNames', () => {
  it('numbers duplicates, ignoring case like Windows/macOS do', () => {
    expect(uniqueNames(['a.webp', 'b.webp', 'a.webp', 'A.webp', 'a.webp'])).toEqual([
      'a.webp',
      'b.webp',
      'a (2).webp',
      'A (3).webp',
      'a (4).webp',
    ]);
  });

  it("doesn't collide with a name that already looks numbered", () => {
    expect(uniqueNames(['a (2).webp', 'a.webp', 'a.webp'])).toEqual([
      'a (2).webp',
      'a.webp',
      'a (3).webp',
    ]);
  });
});

describe('buildZip', () => {
  it('contains every image with unique names and the exact bytes', async () => {
    const zip = await buildZip([
      { name: 'photo.webp', blob: new Blob(['first']) },
      { name: 'photo.webp', blob: new Blob(['second']) }, // photo.png + photo.jpg both → photo.webp
      { name: 'logo.webp', blob: new Blob(['third']) },
    ]);
    expect(zip.type).toBe('application/zip');
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    const text = (name: string) => new TextDecoder().decode(entries[name]);
    expect(Object.keys(entries).sort()).toEqual(['logo.webp', 'photo (2).webp', 'photo.webp']);
    expect(text('photo.webp')).toBe('first');
    expect(text('photo (2).webp')).toBe('second');
    expect(text('logo.webp')).toBe('third');
  });

  it('names the archive with the date and time', () => {
    expect(zipFilename(new Date(2026, 10, 25, 9, 5))).toBe('webp-images-2026-11-25-0905.zip');
  });
});

describe('JobStore', () => {
  it('frees object URLs when images are removed or cleared', () => {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => void revoked.push(url);
    try {
      const store = new JobStore();
      const [a, b] = store.add([file('a.png'), file('b.png')], 'q80');
      store.update(a.id, { outputUrl: 'blob:out-a' });
      store.remove(a.id);
      expect(revoked).toEqual([a.inputUrl, 'blob:out-a']);
      store.clear();
      expect(revoked).toContain(b.inputUrl);
      expect(store.jobs).toHaveLength(0);
    } finally {
      URL.revokeObjectURL = original;
    }
  });

  it('frees the previous output URL when an image is re-converted', () => {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => void revoked.push(url);
    try {
      const store = new JobStore();
      const [a] = store.add([file('a.png')], 'q80');
      store.update(a.id, { outputUrl: 'blob:v1' });
      store.update(a.id, { outputUrl: undefined });
      expect(revoked).toEqual(['blob:v1']);
    } finally {
      URL.revokeObjectURL = original;
    }
  });
});
