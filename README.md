# Image Tool

Convert images to **WebP or AVIF** and **shrink them to a target file size** (for example a 2 MB PNG down to 160 KB), right in the browser.

- **Nothing is uploaded.** Images are processed on your own computer, in the browser tab.
- **$0 to run.** It's a static site: no server, no database, no usage bills.
- **Works offline** after the first visit.

---

## Using it

There are two tabs. Both accept **one image or many**, by drag and drop, **Choose images**, or **paste (Ctrl+V / ⌘V)**. Inputs can be PNG, JPEG, WebP or AVIF.

| Tab                   | What it does                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Convert**           | Re-encodes each image at a quality you pick (default 80), or **Lossless** for screenshots, logos and text.                                                                                                                                                          |
| **Compress / Resize** | Finds the **highest quality that fits a target size** (100 / 160 / 250 / 500 KB or any number from 5 to 50,000 KB). If even low quality is too big, the image is resized just enough to fit. An optional **max width** (800–1920 px) scales wide images down first. |

Shared options under each tab:

- **Format:** WebP (fast, supported everywhere) or AVIF (usually 2–3× smaller, slower to create).
- **File names:** a pattern using `{name}` `{width}` `{height}` `{quality}` `{format}`, e.g. `{name}-{width}w` → `photo-1200w.webp`.

**Downloads:** when **one** image is finished you get the image file. With **two or more** you get **one `.zip`** (`webp-images-2026-11-25-1830.zip`). Each row also has its own **Download** button, and a **Compare** view to check quality side by side (drag the divider; **100%** shows real pixels).

Settings are remembered in this browser. Changing quality or format after converting shows **Apply new settings to N images**.

### Things to know

- A file that's already small can come out **larger** as lossless (common with JPEG photos). The row turns red and tells you what to do.
- Very large images (over 100 megapixels) are rejected so the tab doesn't run out of memory.
- AVIF loads a 3.4 MB encoder the first time you use it. Later uses (and offline use) are instant to start.
- JPEG photos from phones are rotated correctly (EXIF orientation).

---

## Development

Requires **Node.js 20+**.

```bash
npm install
npm run dev          # app at http://localhost:5173
npm run dev:engine   # bare engine test page (dev only)
```

| Command           | What it does                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `npm test`        | Unit + integration tests (Vitest). Integration tests run the **real** WebAssembly codecs in Node. |
| `npm run check`   | Typecheck, lint, format check and tests. Run this before committing.                              |
| `npm run build`   | Production build into `dist/` (includes the offline service worker `sw.js`).                      |
| `npm run preview` | Serve the production build locally.                                                               |
| `npm run format`  | Format everything with Prettier.                                                                  |

### How it's built

- **Vite + TypeScript**, no UI framework (two tabs don't need one).
- **[jSquash](https://github.com/jamsinclair/jSquash)**: Squoosh's codecs compiled to WebAssembly (libwebp, libavif, MozJPEG, a Rust PNG decoder, Lanczos resize).
- All image work runs in a **pool of Web Workers** (`comlink`), so the page never freezes. Measured with a 24-image batch and a 12 MP photo: no main-thread task over 50 ms.
- **`fflate`** builds the zip. Entries are stored, not recompressed, because WebP/AVIF are already compressed.
- A small build plugin in `vite.config.ts` writes `dist/sw.js` with the list of files to cache for offline use. AVIF codecs are cached on first use instead, to keep the first visit small.

```
src/
  main.ts              app shell, tabs, paste handling, service worker registration
  styles.css           all styles (light + dark)
  lib/                 framework-free helpers: worker pool, zip, file names, saved settings, paste
  ui/                  batchTool (shared by both tabs), convertTab, compressTab, fileList, preview, outputFields
  worker/              runs in the Web Worker: codecs, decode/format detection, engine, target-size search
sw/service-worker.js   offline cache (template filled in at build time)
public/_headers        Cloudflare Pages headers: caching + Content-Security-Policy
tests/                 Vitest unit and integration tests
dev/engine-test.html   dev-only engine test page
```

### Download sizes

| What                     | Size (gzipped) | When                 |
| ------------------------ | -------------- | -------------------- |
| Page (HTML, JS, CSS)     | ~19 KB         | First visit          |
| PNG / JPEG / WebP codecs | ~476 KB        | First image          |
| AVIF codecs              | ~1.5 MB        | Only if AVIF is used |

---

## Deploying (Cloudflare Pages, free)

**Option 1: CLI**

```bash
npx wrangler login        # once
npm run deploy            # builds, then uploads dist/ to the "image-tool" Pages project
```

If your Cloudflare login has more than one account, Wrangler asks which one. To skip the question, set `CLOUDFLARE_ACCOUNT_ID` first.

**Option 2: Git.** In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**. Preset **Vite**, build command `npm run build`, output `dist`. Every push then redeploys.

**Optional: limit access to your team.** Cloudflare Zero Trust → **Access → Applications** → protect the `*.pages.dev` URL and allow your team's emails (free for up to 50 users). This isn't needed for privacy, because images never leave the user's computer anyway.

`public/_headers` is applied automatically by Cloudflare Pages. It sets long-term caching for `/assets/*`, `no-cache` for `sw.js` (so updates arrive), and a strict Content-Security-Policy that only allows the app's own files plus WebAssembly.

---

## Browser support

Tested automatically (headless, production build with the real security headers) in **Microsoft Edge** and **Google Chrome**: 47 checks each, covering single and batch conversion, zip contents, compress-to-target, AVIF, compare view, paste, remembered settings and offline mode.

**Firefox** and **Safari** (macOS/iOS) use only standard features (WebAssembly SIMD, module workers, `<dialog>`, `:has()`), but haven't been tested yet. Check them by hand before relying on them.

## Troubleshooting

- **`npm install` warns about install scripts for `esbuild`/`workerd`.** npm 11 skips them by default. The app build doesn't need them. If a Wrangler command fails, run `npm approve-scripts esbuild workerd` and reinstall.
- **Why TypeScript 6, not 7?** `typescript-eslint` doesn't support TS 7 yet. Upgrade once it does.
- **The app looks stale after a deploy.** The service worker updates in the background. Reload once more, or close and reopen the tab.
