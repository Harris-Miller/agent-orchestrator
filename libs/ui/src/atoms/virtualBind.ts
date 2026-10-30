/** Virtual ACP Bind lifecycle: teardown, ensure Bind, mutate-then-rebind. */
import { Effect, Exit } from 'effect';
import type { Atom } from 'effect/reactivity';
import { AtomRegistry } from 'effect/reactivity';

import type { NormalizedSessionInfo } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { dropSession, upsertIntoSnapshot } from '../host/harnessStateTransitions.ts';
import { buildActivatedSession } from '../host/sessionMaterialize.ts';
import { closeSession, createSession, deleteSession } from '../host/sessionRpc.ts';

import { backendHarnessStateAtom, virtualLifecycleInFlightAtom } from './backendState.atoms.ts';
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

/** Publish-policy filter: drop Bound Virtual id from roster until Materialize. */
export const excludeBoundVirtualFromRoster = (
  roster: readonly NormalizedSessionInfo[],
  boundSessionId: string | undefined,
): readonly NormalizedSessionInfo[] =>
  boundSessionId === undefined ? roster : roster.filter(entry => entry.sessionId !== boundSessionId);

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
  if (bound.sessionId in after.sessions || after.sessionRoster.some(entry => entry.sessionId === bound.sessionId)) {
    rw.set(backendHarnessStateAtom(bound.launchTarget), dropSession(after, bound.sessionId));
  }

  const virtual = rw.get(virtualSessionAtom);
  if (virtual?.sessionId === bound.sessionId) {
    rw.set(virtualSessionAtom, { ...virtual, sessionId: undefined });
  }
});

/**
 * Sole Virtual Bind entry: `session/new` + sessions-map upsert + Virtual.sessionId; no roster, no Config.
 * Callers: {@link mutateVirtualThenRebind} after Virtual mutates, and Ready `onPhase`. Not Materialize.
 * Config stays on the Virtual blob until live Bound `setConfigOption` or Materialize.
 * After Bind, optional `refreshFsListing` preloads `@` composer paths.
 */
export const ensureVirtualAcpBound = Effect.fn('ensureVirtualAcpBound')(function* (
  rw: AtomRw,
  refreshFsListing?: RefreshSessionFsListing,
) {
  if (rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }

  const virtual = rw.get(virtualSessionAtom);
  if (virtual === null) {
    return;
  }
  const { cwd, launchTarget, sessionId } = virtual;
  if (launchTarget === undefined || cwd === undefined || !isAbsoluteCwd(cwd)) {
    return;
  }
  if (rw.get(backendHarnessStateAtom(launchTarget)).phase !== 'ready') {
    return;
  }

  const snapshot = rw.get(backendHarnessStateAtom(launchTarget));
  if (sessionId !== undefined && sessionId in snapshot.sessions && snapshot.sessions[sessionId].cwd === cwd) {
    return;
  }

  rw.set(virtualLifecycleInFlightAtom, true);
  yield* Effect.gen(function* () {
    const current = rw.get(virtualSessionAtom);
    if (current?.launchTarget !== launchTarget || current.cwd !== cwd) {
      return;
    }

    if (current.sessionId !== undefined) {
      yield* teardownVirtualAcpBind(rw, { launchTarget, sessionId: current.sessionId });
    }

    yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
    yield* Effect.logInfo('UI ensureVirtualAcpBound', launchTarget, { cwd });

    const createExit = yield* Effect.exit(createSession(launchTarget, cwd));
    if (Exit.isFailure(createExit)) {
      yield* Effect.logError('ensureVirtualAcpBound session/new failed', launchTarget, createExit.cause);
      return;
    }

    const { cwd: createdCwd, result } = createExit.value;
    const boundSessionId = result.sessionId;
    yield* Effect.annotateCurrentSpan('acp.sessionId', boundSessionId);

    const afterCreate = rw.get(backendHarnessStateAtom(launchTarget));
    rw.set(
      backendHarnessStateAtom(launchTarget),
      // Sessions-map upsert only (no roster) — not Materialize.
      upsertIntoSnapshot(afterCreate, {
        session: buildActivatedSession(boundSessionId, result, { cwd: createdCwd }),
      }),
    );

    const latest = rw.get(virtualSessionAtom);
    if (latest?.launchTarget !== launchTarget || latest.cwd !== cwd) {
      // Virtual churned during Bind — drop the orphan session best-effort.
      yield* teardownVirtualAcpBind(rw, { launchTarget, sessionId: boundSessionId });
      return;
    }
    rw.set(virtualSessionAtom, { ...latest, sessionId: boundSessionId });
    if (refreshFsListing !== undefined) {
      yield* refreshFsListing({ cwd: createdCwd, sessionId: boundSessionId });
    }
    yield* Effect.logInfo('UI ensureVirtualAcpBound complete', launchTarget, boundSessionId);
  }).pipe(
    Effect.tapError(error => Effect.logError('ensureVirtualAcpBound failed', error)),
    Effect.ensuring(
      Effect.sync(() => {
        rw.set(virtualLifecycleInFlightAtom, false);
      }),
    ),
  );
});

/**
 * Sync-mutate Virtual, teardown Bound when cwd/LT/id no longer matches, then optional Bind via
 * {@link ensureVirtualAcpBound} (the only mutator-side Bind trigger).
 */
export const mutateVirtualThenRebind = Effect.fn('mutateVirtualThenRebind')(function* (
  rw: AtomRw,
  options: {
    readonly mutate: (rw: AtomRw) => void;
    /** Call {@link ensureVirtualAcpBound} after mutate/teardown. Default true. */
    readonly rebind?: boolean;
    readonly refreshFsListing?: RefreshSessionFsListing;
  },
) {
  if (rw.get(virtualLifecycleInFlightAtom)) {
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
      if (after !== null && after.sessionId === oldBound.sessionId) {
        rw.set(virtualSessionAtom, { ...after, sessionId: undefined });
      }
      yield* teardownVirtualAcpBind(rw, oldBound);
    }
  }

  if (options.rebind !== false) {
    yield* ensureVirtualAcpBound(rw, options.refreshFsListing);
  }
});
