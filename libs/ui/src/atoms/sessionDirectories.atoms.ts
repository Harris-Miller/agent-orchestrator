/** Editing a session's Additional directories (desktop ADR 0024): the Tracked session's record changes, the live session does not. */
import { normalizeProjectDirectories } from '@lib/hoa-home';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';
import { Atom } from 'effect/reactivity';

import { sessionDirectoriesChanged } from '../analytics/catalog.ts';
import { captureEvent } from '../analytics/trackEvent.ts';
import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { replaceSessionHistory } from '../host/harnessStateTransitions.ts';
import type { SessionTarget } from '../host/projectSessions.ts';
import { resolveSessionDirectories, sameDirectories } from '../host/sessionDirectories.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

/** What an edit did: whether the list changed, and how many directories the session has now. */
export type SessionDirectoriesEdit = { readonly changed: boolean; readonly count: number };

/**
 * Sets a Tracked session's Additional directories (absolute, deduped, never its own cwd). Only the History row changes: it is
 * marked edited, so the next activation sends this list (it wins over the Agent-side snapshot and over the Workspace file),
 * and the persister writes the record. A live session is never touched or torn down: ACP takes directories only on
 * `session/new`, `load`, `resume` and `fork`. Nothing happens for an untracked session or an unchanged list.
 */
export const setSessionDirectories = (
  registry: AtomRegistry.AtomRegistry,
  target: SessionTarget,
  directories: readonly string[],
): SessionDirectoriesEdit => {
  const snapshot = registry.get(backendHarnessSnapshotAtom(target.launchTarget));
  const entry = snapshot.sessionHistory.find(row => row.sessionId === target.sessionId);
  if (entry === undefined) return { changed: false, count: 0 };
  const session = target.sessionId in snapshot.sessions ? snapshot.sessions[target.sessionId] : undefined;
  const wanted = normalizeProjectDirectories(entry.cwd, directories);
  const current = resolveSessionDirectories(session, entry).additionalDirectories;
  if (sameDirectories(wanted, current)) return { changed: false, count: wanted.length };
  updateHarnessSnapshot(registry, target.launchTarget, state =>
    replaceSessionHistory(
      state,
      state.sessionHistory.map(row => {
        if (row.sessionId !== target.sessionId) return row;
        const { additionalDirectories: _previous, ...rest } = row;
        return { ...rest, ...(wanted.length === 0 ? {} : { additionalDirectories: wanted }), directoriesEdited: true };
      }),
    ),
  );
  return { changed: true, count: wanted.length };
};

export const createSessionDirectoriesAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  const setSessionDirectoriesAtomFn = atomRuntime
    .fn((arg: SessionTarget & { readonly directories: readonly string[] }, get: Atom.FnContext) =>
      Effect.gen(function* () {
        const { changed, count } = setSessionDirectories(get.registry, arg, arg.directories);
        if (changed) yield* captureEvent(sessionDirectoriesChanged(count));
      }).pipe(Effect.withSpan('setSessionDirectoriesAtomFn', { root: true })),
    )
    .pipe(Atom.keepAlive);
  return { setSessionDirectoriesAtomFn };
};
