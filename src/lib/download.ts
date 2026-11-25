/** Saves a Blob to the user's Downloads folder under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before freeing the memory
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
