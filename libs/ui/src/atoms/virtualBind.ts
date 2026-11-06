/** Virtual ACP Bind lifecycle: teardown, ensure Bind, mutate-then-rebind. */
import { Deferred, Effect, Exit } from 'effect';
import type { Atom } from 'effect/reactivity';
import { AtomRegistry } from 'effect/reactivity';

import { isUsablePhase, normalizeSessionHistory } from '../host/acpSessionBootstrap.ts';
import type { HistoryEntry, NormalizedSessionInfo } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import {
  dropSession,
  mergeListedHistory,
  upsertIntoSnapshot,
  withoutHistoryEntry,
} from '../host/harnessStateTransitions.ts';
import type { SessionListScope } from '../host/sessionListScope.ts';
import { buildActivatedSession } from '../host/sessionMaterialize.ts';
import { closeSession, createSession, deleteSession } from '../host/sessionRpc.ts';

import { backendHarnessStateAtom, virtualBindAtom, virtualMaterializingAtom } from './backendState.atoms.ts';
import type { VirtualBind } from './backendState.atoms.ts';
import type { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import type { VirtualSession } from './virtualSession.atoms.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

type RefreshSessionFsListingAtomFn = ReturnType<typeof createSessionFsListingAtoms>['refreshSessionFsListingAtomFn'];

export type AtomRw = {
  readonly get: <A>(atom: Atom.Atom<A>) => A;
  readonly set: <R, W>(atom: Atom.Writable<R, W>, value: W) => void;
};

/** `@` FS listing preload after Bind. */
export type RefreshSessionFsListing = (arg: {
  readonly cwd: string;
  readonly sessionId: string;
}) => Effect.Effect<unknown>;

/** Shared Bind→FS preload adapter (Ready `onPhase` and mutator AtomFns). */
export const refreshFsListingViaRegistry =
  (
    registry: AtomRegistry.AtomRegistry,
    refreshSessionFsListingAtomFn: RefreshSessionFsListingAtomFn,
  ): RefreshSessionFsListing =>
  arg => {
    registry.set(refreshSessionFsListingAtomFn, arg);
    return AtomRegistry.getResult(registry, refreshSessionFsListingAtomFn, {
      suspendOnWaiting: true,
    });
  };

export const rwFromFnContext = (get: Atom.FnContext): AtomRw => ({
  get: atom => get(atom),
  set: (atom, value) => {
    get.set(atom, value);
  },
});

export const rwFromRegistry = (registry: AtomRegistry.AtomRegistry): AtomRw => ({
  get: atom => registry.get(atom),
  set: (atom, value) => {
    registry.set(atom, value);
  },
});

/** Publish-policy filter: drop Bound Virtual id from history until Materialize. */
export const excludeBoundVirtualFromHistory = (
  history: readonly NormalizedSessionInfo[],
  boundSessionId: string | undefined,
): readonly NormalizedSessionInfo[] =>
  boundSessionId === undefined ? history : history.filter(entry => entry.sessionId !== boundSessionId);

/** Next history after a successful `session/list`: normalize, hide Bound Virtual, merge by scope. */
export const historyAfterList = (
  current: readonly HistoryEntry[],
  listResult: unknown,
  scope: SessionListScope,
  boundSessionId: string | undefined,
): readonly HistoryEntry[] =>
  mergeListedHistory(
    current,
    excludeBoundVirtualFromHistory(normalizeSessionHistory(listResult), boundSessionId),
    scope,
  );

/** ACP v1 cwd must be absolute; no post-create cwd mutator (teardown + Bind on change). */
const isAbsoluteCwd = (cwd: string): boolean =>
  cwd.startsWith('/') || cwd.startsWith('\\\\') || /^[A-Za-z]:[/\\]/.test(cwd);

type BoundRef = {
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

const boundRefOf = (virtual: null | VirtualSession): BoundRef | undefined =>
  virtual?.sessionId !== undefined && virtual.launchTarget !== undefined
    ? { launchTarget: virtual.launchTarget, sessionId: virtual.sessionId }
    : undefined;

/** Best-effort close+delete Bound session (no session dir). Failed delete must not block replacement Bind. */
export const teardownVirtualAcpBind = Effect.fn('teardownVirtualAcpBind')(function* (rw: AtomRw, bound: BoundRef) {
  const snapshot = rw.get(backendHarnessStateAtom(bound.launchTarget));
  const session = bound.sessionId in snapshot.sessions ? snapshot.sessions[bound.sessionId] : undefined;
  if (session !== undefined && session.status !== 'inactive') {
    yield* Effect.exit(closeSession(bound.launchTarget, bound.sessionId));
  }
  yield* Effect.exit(deleteSession(bound.launchTarget, bound.sessionId));

  const after = rw.get(backendHarnessStateAtom(bound.launchTarget));
  if (bound.sessionId in after.sessions || after.sessionHistory.some(entry => entry.sessionId === bound.sessionId)) {
    rw.set(backendHarnessStateAtom(bound.launchTarget), dropSession(after, bound.sessionId));
  }

  const virtual = rw.get(virtualSessionAtom);
  if (virtual?.sessionId === bound.sessionId) {
    rw.set(virtualSessionAtom, { ...virtual, sessionId: undefined });
  }
});

const bindKeyMatches = (virtual: null | VirtualSession, bind: VirtualBind): boolean =>
  virtual?.launchTarget === bind.launchTarget && virtual.cwd === bind.cwd;

/** Clear the Bound id on the blob now and tear the old session down in the background (never blocks Bind/Send). */
const releaseBoundInBackground = Effect.fn('releaseBoundInBackground')(function* (rw: AtomRw, bound: BoundRef) {
  const virtual = rw.get(virtualSessionAtom);
  if (virtual?.sessionId === bound.sessionId) {
    rw.set(virtualSessionAtom, { ...virtual, sessionId: undefined });
  }
  yield* Effect.forkDetach(teardownVirtualAcpBind(rw, bound));
});

/** One Bind attempt: `session/new` + sessions-map upsert; discards (tears down) its session when superseded. */
const runVirtualBind = Effect.fn('runVirtualBind')(function* (
  rw: AtomRw,
  bind: VirtualBind,
  refreshFsListing?: RefreshSessionFsListing,
) {
  const { cwd, launchTarget } = bind;
  yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
  yield* Effect.logInfo('UI ensureVirtualAcpBound', launchTarget, { cwd });

  const createExit = yield* Effect.exit(createSession(launchTarget, cwd));
  if (Exit.isFailure(createExit)) {
    yield* Effect.logError('ensureVirtualAcpBound session/new failed', launchTarget, createExit.cause);
    return undefined;
  }

  const { cwd: createdCwd, result } = createExit.value;
  const boundSessionId = result.sessionId;
  yield* Effect.annotateCurrentSpan('acp.sessionId', boundSessionId);

  const afterCreate = rw.get(backendHarnessStateAtom(launchTarget));
  rw.set(
    backendHarnessStateAtom(launchTarget),
    // Sessions-map upsert only (no history) — not Materialize.
    // A parallel startup `session/list` may have landed before this id existed.
    withoutHistoryEntry(
      upsertIntoSnapshot(afterCreate, {
        session: buildActivatedSession(boundSessionId, result, { cwd: createdCwd }),
      }),
      boundSessionId,
    ),
  );

  const latest = rw.get(virtualSessionAtom);
  if (rw.get(virtualBindAtom).latest !== bind.generation || latest === null || !bindKeyMatches(latest, bind)) {
    // Superseded or Virtual churned during Bind — drop the orphan session best-effort.
    yield* teardownVirtualAcpBind(rw, { launchTarget, sessionId: boundSessionId });
    return undefined;
  }
  rw.set(virtualSessionAtom, { ...latest, sessionId: boundSessionId });
  if (refreshFsListing !== undefined) {
    yield* refreshFsListing({ cwd: createdCwd, sessionId: boundSessionId });
  }
  yield* Effect.logInfo('UI ensureVirtualAcpBound complete', launchTarget, boundSessionId);
  return boundSessionId;
});

/**
 * Request a Bind for the current Virtual blob without waiting for it. Latest-wins: a request with a new
 * `{launchTarget, cwd}` supersedes any in-flight Bind (its session is torn down when it lands); the same key joins it.
 * Returns `undefined` when nothing needs binding (unusable, no valid key, already Bound, Materializing).
 */
export const requestVirtualBind = Effect.fn('requestVirtualBind')(function* (
  rw: AtomRw,
  refreshFsListing?: RefreshSessionFsListing,
) {
  if (rw.get(virtualMaterializingAtom)) {
    return undefined;
  }

  const virtual = rw.get(virtualSessionAtom);
  if (virtual === null) {
    return undefined;
  }
  const { cwd, launchTarget, sessionId } = virtual;
  if (launchTarget === undefined || cwd === undefined || !isAbsoluteCwd(cwd)) {
    return undefined;
  }
  if (!isUsablePhase(rw.get(backendHarnessStateAtom(launchTarget)).phase)) {
    return undefined;
  }

  const snapshot = rw.get(backendHarnessStateAtom(launchTarget));
  if (sessionId !== undefined && sessionId in snapshot.sessions && snapshot.sessions[sessionId].cwd === cwd) {
    return undefined;
  }

  const state = rw.get(virtualBindAtom);
  if (state.current?.launchTarget === launchTarget && state.current.cwd === cwd) {
    return state.current;
  }

  if (sessionId !== undefined) {
    yield* releaseBoundInBackground(rw, { launchTarget, sessionId });
  }

  const bind: VirtualBind = {
    cwd,
    done: yield* Deferred.make<string | undefined>(),
    generation: state.latest + 1,
    launchTarget,
  };
  rw.set(virtualBindAtom, { current: bind, latest: bind.generation });

  // Detached: a re-invoked AtomFn must not interrupt a `session/new` already on the wire.
  yield* Effect.forkDetach(
    runVirtualBind(rw, bind, refreshFsListing).pipe(
      Effect.tapError(error => Effect.logError('ensureVirtualAcpBound failed', error)),
      Effect.catchCause(() => Effect.succeed(undefined)),
      Effect.tap(boundSessionId => Deferred.succeed(bind.done, boundSessionId)),
      Effect.ensuring(
        Effect.sync(() => {
          const after = rw.get(virtualBindAtom);
          if (after.current?.generation === bind.generation) {
            rw.set(virtualBindAtom, { ...after, current: undefined });
          }
        }),
      ),
    ),
  );
  return bind;
});

/**
 * Wait for the newest Bind to settle (re-awaiting if a newer one supersedes it meanwhile).
 * Resolves to the Bound id on the blob, or `undefined` when nothing is bound.
 */
export const awaitCurrentVirtualBind = Effect.fn('awaitCurrentVirtualBind')(function* (rw: AtomRw) {
  let awaited: undefined | VirtualBind;
  for (;;) {
    const { current } = rw.get(virtualBindAtom);
    if (current === undefined || current === awaited) {
      return rw.get(virtualSessionAtom)?.sessionId;
    }
    awaited = current;
    yield* Deferred.await(current.done);
  }
});

/**
 * Request a Bind and wait for the newest one to settle. Callers: Ready/usable `onPhase` and tests;
 * mutators use {@link requestVirtualBind} (the only mutator-side Bind trigger). Not Materialize.
 * Config stays on the Virtual blob until Materialize.
 * After Bind, optional `refreshFsListing` preloads `@` composer paths.
 */
export const ensureVirtualAcpBound = Effect.fn('ensureVirtualAcpBound')(function* (
  rw: AtomRw,
  refreshFsListing?: RefreshSessionFsListing,
) {
  yield* requestVirtualBind(rw, refreshFsListing);
  yield* awaitCurrentVirtualBind(rw);
});

/**
 * Sync-mutate Virtual, release the Bound session in the background when cwd/LT/id no longer matches, then
 * optionally request a Bind via {@link requestVirtualBind}. Never waits on a Bind.
 */
export const mutateVirtualThenRebind = Effect.fn('mutateVirtualThenRebind')(function* (
  rw: AtomRw,
  options: {
    readonly mutate: (rw: AtomRw) => void;
    /** Request a Bind after mutate/teardown. Default true. */
    readonly rebind?: boolean;
    readonly refreshFsListing?: RefreshSessionFsListing;
  },
) {
  if (rw.get(virtualMaterializingAtom)) {
    return;
  }

  const before = rw.get(virtualSessionAtom);
  const oldBound = boundRefOf(before);

  options.mutate(rw);

  const after = rw.get(virtualSessionAtom);
  if (oldBound !== undefined) {
    const stillBound =
      after !== null &&
      after.sessionId === oldBound.sessionId &&
      after.launchTarget === oldBound.launchTarget &&
      after.cwd === before?.cwd;
    if (!stillBound) {
      yield* releaseBoundInBackground(rw, oldBound);
    }
  }

  if (options.rebind !== false) {
    yield* requestVirtualBind(rw, options.refreshFsListing);
  }
});

/** Wait until the provider is usable or errored, or the blob moved off `launchTarget` (whichever comes first). */
export const awaitProviderSettled = (registry: AtomRegistry.AtomRegistry, launchTarget: AgentLaunchTarget) =>
  Effect.callback<undefined>(resume => {
    const unsubscribes: (() => void)[] = [];
    const settled = () => {
      const { phase } = registry.get(backendHarnessStateAtom(launchTarget));
      return (
        isUsablePhase(phase) || phase === 'error' || registry.get(virtualSessionAtom)?.launchTarget !== launchTarget
      );
    };
    const check = () => {
      if (settled()) {
        unsubscribes.forEach(unsubscribe => {
          unsubscribe();
        });
        resume(Effect.succeed(undefined));
      }
    };
    if (settled()) {
      resume(Effect.succeed(undefined));
      return;
    }
    unsubscribes.push(
      registry.subscribe(backendHarnessStateAtom(launchTarget), check),
      registry.subscribe(virtualSessionAtom, check),
    );
    return Effect.sync(() => {
      unsubscribes.forEach(unsubscribe => {
        unsubscribe();
      });
    });
  });
