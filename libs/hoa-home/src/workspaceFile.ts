/**
 * `.code-workspace` files (glossary: Workspace file). A Workspace project is a Project whose path is one; this module
 * reads the folders it lists. Pure parse plus one read; the Project resolution seam lives in `@lib/ui`.
 */
import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { parse } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';

const WORKSPACE_FILE_EXTENSION = '.code-workspace';

/** True for a path that names a Workspace file (by extension, case-insensitive). */
export const isWorkspaceFilePath = (path: string): boolean => path.toLowerCase().endsWith(WORKSPACE_FILE_EXTENSION);

/**
 * A Workspace file could not give a usable folder list: `unreadable` (missing, moved, outside the readable filesystem
 * scope), `invalid` (not JSONC with a `folders` list) or `no-folders` (no `file:` folder left). The message never
 * carries the file's path or contents.
 */
export class WorkspaceFileUnresolvable extends Schema.TaggedError<WorkspaceFileUnresolvable>()(
  'WorkspaceFileUnresolvable',
  { message: Schema.String, reason: Schema.Literals(['unreadable', 'invalid', 'no-folders']) },
) {}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A `file:` URI's filesystem path, or `undefined` for any other scheme. Portable: no `node:url`. */
const fileUriPath = (uri: string): string | undefined => {
  const match = /^file:\/\/([^/?#]*)([^?#]*)/iu.exec(uri);
  if (match === null) return undefined;
  let pathname: string;
  try {
    pathname = decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
  // `file:///c:/x` -> `c:/x`; a UNC host (`file://server/share`) keeps its host.
  if (/^\/[A-Za-z]:/u.test(pathname)) return pathname.slice(1);
  return match[1] === '' ? pathname : `//${match[1]}${pathname}`;
};

/** One `folders` entry's absolute path: its `path` (relative to `baseDir`), else its `file:` `uri`; `undefined` for anything else. */
const folderPath = (entry: Readonly<Record<string, unknown>>, baseDir: string, path: Path): string | undefined => {
  if (typeof entry.path === 'string' && entry.path.length > 0) return path.resolve(baseDir, entry.path);
  return typeof entry.uri === 'string' ? fileUriPath(entry.uri) : undefined;
};

/**
 * The `file:` folders of a Workspace file's content, in order and de-duplicated: JSONC (comments, trailing commas),
 * relative `path`s resolved against the file's directory, `uri` folders kept only for the `file` scheme. Fails with
 * {@link WorkspaceFileUnresolvable} when the content is not a workspace or no folder remains.
 */
export const parseWorkspaceFolders = Effect.fn('parseWorkspaceFolders')(function* (
  content: string,
  workspaceFile: string,
) {
  const path = yield* Path;
  const errors: ParseError[] = [];
  const document: unknown = parse(content, errors, { allowEmptyContent: false, allowTrailingComma: true });
  if (errors.length > 0 || !isRecord(document)) {
    return yield* new WorkspaceFileUnresolvable({ message: 'Not a valid workspace file', reason: 'invalid' });
  }
  const entries: readonly unknown[] = Array.isArray(document.folders) ? document.folders : [];
  const baseDir = path.dirname(workspaceFile);
  const folders: string[] = [];
  for (const entry of entries) {
    const resolved = isRecord(entry) ? folderPath(entry, baseDir, path) : undefined;
    if (resolved !== undefined && !folders.includes(resolved)) folders.push(resolved);
  }
  if (folders.length === 0) {
    return yield* new WorkspaceFileUnresolvable({
      message: 'The workspace file lists no local folders',
      reason: 'no-folders',
    });
  }
  return folders;
});

/** Reads a Workspace file and returns its folders ({@link parseWorkspaceFolders}); a failed read is `unreadable`. */
export const readWorkspaceFolders = Effect.fn('readWorkspaceFolders')(function* (workspaceFile: string) {
  const fs = yield* FileSystem;
  const content = yield* fs
    .readFileString(workspaceFile)
    .pipe(
      Effect.mapError(
        () => new WorkspaceFileUnresolvable({ message: 'The workspace file could not be read', reason: 'unreadable' }),
      ),
    );
  return yield* parseWorkspaceFolders(content, workspaceFile);
});
