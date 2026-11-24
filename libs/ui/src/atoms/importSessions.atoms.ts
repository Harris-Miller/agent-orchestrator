/** Import: the only place `session/list` runs. Pages every usable launch target of one cwd and confirms a row into a Tracked session. */
import { Effect, Exit, Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { dropSession } from '../host/harnessStateTransitions.ts';
import {
  applyImportPage,
  beginImportPage,
  failImportPage,
  importableRows,
  initialImportState,
  resetImportTargetError,
  targetsWithMorePages,
} from '../host/importSessions.ts';
import type { ImportState } from '../host/importSessions.ts';
import { listSessionsPayload } from '../host/sessionListScope.ts';
import { listSessionsPage } from '../host/sessionRpc.ts';

import {
  backendHarnessSnapshotAtom,
  requireLaunchTargetUsable,
  selectedAtom,
  unifiedSessionHistoryAtom,
} from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { spawnedChildrenSnapshotAtom, wasSpawnedChildIn } from './spawnedSubagent/links.ts';
import { untrackSession } from './trackedSessions.ts';
import { activateSession } from './sessionLifecycle.ts';
import { trackSession } from './trackSession.ts';
import { select } from './virtualSession.atoms.ts';

/** The Confirm failed: `session/load` did not succeed, so nothing was tracked. */
export class ImportSessionFailed extends Schema.TaggedError<ImportSessionFailed>()('ImportSessionFailed', {
  message: Schema.String,
}) {}

export const importStateAtom = Atom.make<ImportState>(initialImportState(undefined, 0)).pipe(
  Atom.withLabel('importState'),
  Atom.keepAlive,
);

/** Rows the open Import lists: not yet tracked (archived tracked ones included) and never a Spawned subagent session, newest Last prompt time first. */
export const importRowsAtom = Atom.make(get => {
  const children = get(spawnedChildrenSnapshotAtom);
  return importableRows(get(importStateAtom), get(unifiedSessionHistoryAtom)).filter(
    ({ launchTarget, sessionId }) => !wasSpawnedChildIn(children, { launchTarget, sessionId }),
  );
}).pipe(Atom.keepAlive);

export const createImportSessionsAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  /** Fetches the next page of each given target in parallel; one target's failure stays in that target. */
  const loadPages = (get: Atom.FnContext, targets: readonly AgentLaunchTarget[]) =>
    Effect.forEach(
      targets,
      launchTarget =>
        Effect.gen(function* () {
          const start = get.registry.get(importStateAtom);
          const target = start.targets[launchTarget];
          if (start.cwd === undefined || target.status !== 'idle') return;
          if (!isUsablePhase(get.registry.get(backendHarnessSnapshotAtom(launchTarget)).phase)) return;
          const { cwd, generation } = start;
          get.registry.set(importStateAtom, beginImportPage(start, launchTarget));
          const exit = yield* Effect.exit(
            listSessionsPage(launchTarget, listSessionsPayload(launchTarget, cwd), target.cursor),
          );
          // An Import opened since this request began owns the state now.
          if (get.registry.get(importStateAtom).generation !== generation) return;
          get.registry.update(importStateAtom, current =>
            Exit.isSuccess(exit)
              ? applyImportPage(current, launchTarget, exit.value)
              : failImportPage(current, launchTarget, 'session/list failed'),
          );
        }),
      { concurrency: 'unbounded', discard: true },
    );

  /** Opens Import for `cwd`: resets the state and fetches the first page of every usable launch target. */
  const openImportAtomFn = atomRuntime
    .fn(
      Effect.fn('openImportAtomFn', { root: true })(function* (cwd: string, get: Atom.FnContext) {
        get.registry.update(importStateAtom, current => initialImportState(cwd, current.generation + 1));
        yield* loadPages(get, targetsWithMorePages(get.registry.get(importStateAtom)));
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  /** Scrolling near the end: the next page of every target that still has one. */
  const importLoadMoreAtomFn = atomRuntime
    .fn(
      Effect.fn('importLoadMoreAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        yield* loadPages(get, targetsWithMorePages(get.registry.get(importStateAtom)));
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  const importRetryTargetAtomFn = atomRuntime
    .fn(
      Effect.fn('importRetryTargetAtomFn', { root: true })(function* (
        launchTarget: AgentLaunchTarget,
        get: Atom.FnContext,
      ) {
        get.registry.update(importStateAtom, current => resetImportTargetError(current, launchTarget));
        yield* loadPages(get, [launchTarget]);
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  /** Closes Import: later pages answered for it are dropped. */
  const closeImportAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) => {
      get.registry.update(importStateAtom, current => initialImportState(undefined, current.generation + 1));
      return Effect.void;
    })
    .pipe(Atom.keepAlive);

  /**
   * Confirm: loads the session (the normal activation path, which Selects it); only when that succeeds does the session
   * stay tracked. On failure the row is rolled back and explicitly untracked so the persister keeps nothing.
   */
  const importSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('importSessionAtomFn', { root: true })(function* (
        arg: { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string },
        get: Atom.FnContext,
      ) {
        const { launchTarget, sessionId } = arg;
        const blocked = requireLaunchTargetUsable(get, launchTarget);
        if (blocked !== undefined) return yield* blocked;
        const row = get.registry
          .get(importStateAtom)
          .rows.find(entry => entry.launchTarget === launchTarget && entry.sessionId === sessionId);
        if (row === undefined) {
          return yield* new ImportSessionFailed({ message: 'This session is no longer in the import list' });
        }
        const { launchTarget: _launchTarget, ...historyEntry } = row satisfies UnifiedHistoryEntry;
        yield* trackSession(get.registry, launchTarget, historyEntry);

        yield* activateSession(get.registry, { launchTarget, sessionId });
        const session = get.registry.get(backendHarnessSnapshotAtom(launchTarget)).sessions[sessionId];
        if (session?.status !== 'active') {
          updateHarnessSnapshot(get.registry, launchTarget, current => dropSession(current, sessionId));
          yield* untrackSession(launchTarget, historyEntry.cwd, sessionId);
          const selected = get.registry.get(selectedAtom);
          if (selected?._tag === 'Session' && selected.sessionId === sessionId) {
            yield* select(get.registry, undefined);
          }
          return yield* new ImportSessionFailed({ message: 'The agent could not load this session' });
        }
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  return {
    closeImportAtomFn,
    importLoadMoreAtomFn,
    importRetryTargetAtomFn,
    importSessionAtomFn,
    openImportAtomFn,
  };
};
