import type { Effect } from 'effect';
import { Context } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

/**
 * Host-local atomic publication of provider state (`~/.ao/providers/<id>/current.json`).
 * The Host writes a temp file beside the target and atomically replaces it. Hosts reject any other path;
 * the shared `FileSystem.rename` is unsupported on VS Code, so this is its own op.
 */
export interface AtomicFile {
  readonly replaceFileString: (path: string, content: string) => Effect.Effect<void, PlatformError>;
}

export const AtomicFile = Context.Service<AtomicFile>('AtomicFile');
