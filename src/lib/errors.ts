export type ImageErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'DECODE_FAILED'
  | 'ENCODE_FAILED'
  | 'TARGET_UNREACHABLE'
  | 'INVALID_OPTIONS'
  | 'WORKER_CRASHED'
  | 'UNKNOWN';

/** Error with a machine-readable code, so the UI can show a friendly message. */
export class ImageToolError extends Error {
  readonly code: ImageErrorCode;

  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = 'ImageToolError';
    this.code = code;
  }
}

/** Plain-object form of an error, safe to send across postMessage. */
export interface ErrorPayload {
  code: ImageErrorCode;
  message: string;
}

export function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof ImageToolError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: 'UNKNOWN', message: err.message };
  return { code: 'UNKNOWN', message: String(err) };
}
