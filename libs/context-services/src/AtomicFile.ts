import type { Effect } from 'effect';
import { Context } from 'effect';
import * as PlatformError from 'effect/PlatformError';

/**
 * Host-local atomic publication of provider state (`~/.hoa/providers/<id>/current.json`).
 * The Host writes a temp file beside the target and atomically replaces it. Hosts reject any other path;
 * the shared `FileSystem.rename` is unsupported on VS Code, so this is its own op.
 */
export interface AtomicFile {
  readonly replaceFileString: (path: string, content: string) => Effect.Effect<void, PlatformError.PlatformError>;
}

export const AtomicFile = Context.Service<AtomicFile>('AtomicFile');

/** What every Host maps a failed atomic replace to. */
export const atomicReplaceFailed = (path: string, cause: unknown): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    cause,
    description: cause instanceof Error ? cause.message : String(cause),
    method: 'replaceFileString',
    module: 'FileSystem',
    pathOrDescriptor: path,
  });
