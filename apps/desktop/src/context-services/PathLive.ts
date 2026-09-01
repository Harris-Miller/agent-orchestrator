/**
 * Tauri's `import { path } from '@tauri-apps/api';` is async and breaks effect/Path's contract.
 * Effect provides a built-in posixPathLayer we can use. This file provides a `win32` implementation.
 */

import { OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { Path, layer as posixPathLayer, TypeId } from 'effect/Path';
import { BadArgument } from 'effect/PlatformError';

const isPathSeparator = (code: number): boolean => code === 47 /* / */ || code === 92; /* \ */

const win32IsAbsolute = (path: string): boolean => {
  const len = path.length;
  if (len === 0) {
    return false;
  }
  const code0 = path.charCodeAt(0);
  if (isPathSeparator(code0)) {
    // UNC or absolute with /
    return true;
  }
  // Drive letter: C:\ or C:/
  if (len > 2 && ((code0 >= 65 && code0 <= 90) || (code0 >= 97 && code0 <= 122)) && path.charCodeAt(1) === 58 /* : */) {
    return isPathSeparator(path.charCodeAt(2));
  }
  return false;
};

const win32Normalize = (path: string): string => {
  if (path.length === 0) {
    return '.';
  }
  // Normalize separators to \, collapse . and .. via a simple split/join.
  const replaced = path.replaceAll('/', '\\');
  const isAbs = win32IsAbsolute(replaced);
  const rootMatch = /^([a-zA-Z]:\\)/.exec(replaced);
  const uncMatch = /^(\\\\[^\\]+\\[^\\]+\\?)/.exec(replaced);
  let root = '';
  let rest = replaced;
  if (uncMatch) {
    const [, uncRoot] = uncMatch;
    root = uncRoot;
    rest = replaced.slice(root.length);
  } else if (rootMatch) {
    const [, driveRoot] = rootMatch;
    root = driveRoot;
    rest = replaced.slice(root.length);
  } else if (isAbs && replaced.startsWith('\\')) {
    root = '\\';
    rest = replaced.slice(1);
  }
  const parts = rest.split('\\').filter(part => part.length > 0 && part !== '.');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbs) {
        stack.push('..');
      }
    } else {
      stack.push(part);
    }
  }
  const body = stack.join('\\');
  if (body.length === 0) {
    return root.length > 0 ? root.replace(/\\$/, '') || root : '.';
  }
  return `${root}${body}`;
};

const win32Join = (...paths: readonly string[]): string => {
  if (paths.length === 0) {
    return '.';
  }
  let joined: string | undefined;
  for (const segment of paths) {
    if (segment.length > 0) {
      joined = joined === undefined ? segment : `${joined}\\${segment}`;
    }
  }
  if (joined === undefined) {
    return '.';
  }
  return win32Normalize(joined);
};

const win32Basename = (path: string, suffix?: string): string => {
  const normalized = path.replaceAll('/', '\\');
  const end = normalized.endsWith('\\') && normalized.length > 1 ? normalized.length - 1 : normalized.length;
  const start = normalized.lastIndexOf('\\', end - 1) + 1;
  let base = normalized.slice(start, end);
  if (suffix !== undefined && suffix.length > 0 && base.endsWith(suffix) && base !== suffix) {
    base = base.slice(0, base.length - suffix.length);
  }
  return base;
};

const win32Dirname = (path: string): string => {
  const normalized = path.replaceAll('/', '\\');
  if (normalized.length === 0) {
    return '.';
  }
  const end = normalized.endsWith('\\') && normalized.length > 1 ? normalized.length - 1 : normalized.length;
  const sep = normalized.lastIndexOf('\\', end - 1);
  if (sep === -1) {
    if (normalized.length >= 2 && normalized.charCodeAt(1) === 58 /* : */) {
      return `${normalized.slice(0, 2)}\\`;
    }
    return '.';
  }
  if (sep === 0) {
    return '\\';
  }
  // Keep drive root like C:\
  if (sep === 2 && normalized.charCodeAt(1) === 58) {
    return normalized.slice(0, 3);
  }
  return normalized.slice(0, sep);
};

const win32Extname = (path: string): string => {
  const base = win32Basename(path);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot);
};

/**
 * Pure-TS Windows `Path` service (no IPC). Used when {@link OS.platform} is `win32`.
 */
export const makeWin32Path = (): Path =>
  Path.of({
    basename: win32Basename,
    dirname: win32Dirname,
    extname: win32Extname,
    format: (pathObject: Partial<Path.Parsed>) => {
      const dir = pathObject.dir ?? '';
      const base = pathObject.base ?? `${pathObject.name ?? ''}${pathObject.ext ?? ''}`;
      if (dir.length === 0) {
        return base;
      }
      if (dir.endsWith('\\') || dir.endsWith('/')) {
        return `${dir}${base}`;
      }
      return `${dir}\\${base}`;
    },
    fromFileUrl: (url: URL) =>
      Effect.try({
        catch: cause =>
          new BadArgument({
            cause,
            method: 'fromFileUrl',
            module: 'Path',
          }),
        try: () => {
          if (url.protocol !== 'file:') {
            throw new TypeError('URL must be of scheme file');
          }
          let pathname = decodeURIComponent(url.pathname);
          // file:///C:/foo -> C:\foo
          if (/^\/[a-zA-Z]:/.test(pathname)) {
            pathname = pathname.slice(1);
          }
          return pathname.replaceAll('/', '\\');
        },
      }),
    isAbsolute: win32IsAbsolute,
    join: win32Join,
    normalize: win32Normalize,
    parse: (path: string) => {
      const root = win32IsAbsolute(path)
        ? (/^([a-zA-Z]:\\)/.exec(path.replaceAll('/', '\\'))?.[1] ??
          /^(\\\\[^\\]+\\[^\\]+\\?)/.exec(path.replaceAll('/', '\\'))?.[1] ??
          '\\')
        : '';
      const base = win32Basename(path);
      const ext = win32Extname(path);
      const name = ext.length > 0 ? base.slice(0, base.length - ext.length) : base;
      const dir = win32Dirname(path);
      return { base, dir: dir === '.' ? '' : dir, ext, name, root };
    },
    relative: (from: string, to: string) => {
      const fromNorm = win32Normalize(from).toLowerCase();
      const toNorm = win32Normalize(to).toLowerCase();
      if (fromNorm === toNorm) {
        return '';
      }
      // Best-effort relative; prefer absolute `to` when drives differ.
      const fromRoot = /^[a-zA-Z]:/.exec(fromNorm)?.[0];
      const toRoot = /^[a-zA-Z]:/.exec(toNorm)?.[0];
      if (fromRoot !== undefined && toRoot !== undefined && fromRoot !== toRoot) {
        return win32Normalize(to);
      }
      const fromParts = fromNorm.split('\\').filter(Boolean);
      const toParts = toNorm.split('\\').filter(Boolean);
      let i = 0;
      while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i += 1;
      }
      const ups = fromParts.length - i;
      const downs = toParts.slice(i);
      return [...Array.from({ length: ups }, () => '..'), ...downs].join('\\');
    },
    resolve: (...segments: readonly string[]) => {
      let resolved = '';
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        const segment = segments[i] ?? '';
        if (segment.length > 0) {
          resolved = resolved.length === 0 ? segment : `${segment}\\${resolved}`;
          if (win32IsAbsolute(segment)) {
            break;
          }
        }
      }
      return win32Normalize(resolved.length === 0 ? '.' : resolved);
    },
    sep: '\\',
    toFileUrl: (path: string) =>
      Effect.try({
        catch: cause =>
          new BadArgument({
            cause,
            method: 'toFileUrl',
            module: 'Path',
          }),
        try: () => {
          const normalized = win32Normalize(path).replaceAll('\\', '/');
          const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
          return new URL(`file://${withSlash}`);
        },
      }),
    toNamespacedPath: (path: string) => path,
    [TypeId]: TypeId,
  });

/**
 * Platform-aware `Path` Live: Effect's POSIX `Path.layer` on non-Windows, pure-TS
 * win32 semantics when {@link OS.platform} is `win32`.
 */
export const PathLive = Layer.effect(
  Path,
  Effect.gen(function* () {
    const os = yield* OS;
    if (os.platform() === 'win32') {
      return makeWin32Path();
    }
    return yield* Effect.provide(Path, posixPathLayer);
  }),
);
