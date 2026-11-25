import { isAbsolute, resolve } from 'node:path';

/** Throws unless `path` is absolute. The message never names the path (Private data). */
export const assertAbsolutePath = (path: string): void => {
  if (!isAbsolute(path)) {
    throw new Error('Editor file path must be absolute');
  }
};

/** Path-normalized equality (case-insensitive on Windows). */
export const samePath = (a: string, b: string): boolean => {
  const left = resolve(a);
  const right = resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
};

/**
 * Slice `text` to `limit` lines starting at 1-based `line`, keeping original line endings.
 * `null`/`undefined` leave a bound unset; a `line` past the end gives `''`.
 */
export const sliceTextLines = (text: string, line?: null | number, limit?: null | number): string => {
  if (line != null && (!Number.isInteger(line) || line < 1)) {
    throw new Error('Invalid line');
  }
  if (limit != null && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error('Invalid limit');
  }
  if (line == null && limit == null) {
    return text;
  }
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const start = (line ?? 1) - 1;
  return lines.slice(start, limit == null ? undefined : start + limit).join('');
};
