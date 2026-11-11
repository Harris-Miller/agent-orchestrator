/** Session-scoped recursive `fd` listing cache (keyed by sessionId + cwd). */
import { Effect, Exit, Redacted } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { FdListingEntry } from '../host/fdListing.ts';
import { listRecursiveEntries } from '../host/fdListing.ts';

export type SessionFsListingState = {
  readonly cwd: string;
  readonly entries: readonly FdListingEntry[];
  readonly status: 'empty' | 'loading' | 'ready';
};

const emptyListing = (cwd: string): SessionFsListingState => ({
  cwd,
  entries: [],
  status: 'empty',
});

/** Composite Atom key: `sessionId\\0cwd`. */
export const sessionFsListingKey = (sessionId: string, cwd: string): string => `${sessionId}\0${cwd}`;

export const sessionFsListingAtom = Atom.family((key: string) =>
  Atom.make<SessionFsListingState>(emptyListing('')).pipe(
    Atom.withLabel(`sessionFsListing:${key.replace('\0', ' @ ')}`),
    Atom.keepAlive,
  ),
);

export const createSessionFsListingAtoms = (
  runtime: HostRuntimeBag,
  alwaysHiddenGlobsAtom: Atom.Atom<readonly string[]>,
) => {
  const { atomRuntime } = runtime;

  /**
   * Load / refresh recursive listing for `sessionId`+`cwd`.
   * Replaces cache on success; leaves prior entries until then (stale OK).
   * If cache empty, sets `loading` so UI can show Skeletons.
   * Reads Always-hidden globs at list time — stale until next refresh if Settings change while idle.
   */
  const refreshSessionFsListingAtomFn = atomRuntime
    .fn(
      Effect.fn('refreshSessionFsListingAtomFn')(function* (
        arg: { cwd: string; sessionId: string },
        get: Atom.FnContext,
      ) {
        const alwaysHiddenGlobs = get(alwaysHiddenGlobsAtom);
        const key = sessionFsListingKey(arg.sessionId, arg.cwd);
        const current = get(sessionFsListingAtom(key));
        if (current.status === 'empty' || current.cwd !== arg.cwd) {
          get.set(sessionFsListingAtom(key), { cwd: arg.cwd, entries: [], status: 'loading' });
        }

        const exit = yield* Effect.exit(listRecursiveEntries(arg.cwd, alwaysHiddenGlobs));
        if (Exit.isFailure(exit)) {
          yield* Effect.logWarning('session fs listing failed', arg.sessionId, Redacted.make(arg.cwd), exit.cause);
          if (get(sessionFsListingAtom(key)).status === 'loading') {
            get.set(sessionFsListingAtom(key), emptyListing(arg.cwd));
          }
          return;
        }

        get.set(sessionFsListingAtom(key), {
          cwd: arg.cwd,
          entries: exit.value,
          status: 'ready',
        });
      }),
    )
    .pipe(Atom.keepAlive);

  return { refreshSessionFsListingAtomFn };
};
