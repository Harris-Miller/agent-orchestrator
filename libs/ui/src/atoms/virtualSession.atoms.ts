/** In-memory Virtual session blob + ensure / Bind / selection helpers. */
import { Effect, Exit } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { NormalizedSessionInfo } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { hardResetForAgent, sanitizeConfigValuesForIndex } from '../host/configOptionIndexUi.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';
import { dropSession, materializeIntoSnapshot } from '../host/harnessStateTransitions.ts';
import { applyConfigDiffs, buildActivatedSession } from '../host/sessionMaterialize.ts';
import type { ConfigValueDiff } from '../host/sessionMaterialize.ts';
import { closeSession, createSession, deleteSession, setConfigOption } from '../host/sessionRpc.ts';

import {
  backendHarnessStateAtom,
  configOptionIndexAtom,
  findLaunchTargetForSessionId,
  selectedAtom,
  selectedSessionAtom,
  unifiedSessionRosterAtom,
  virtualLifecycleInFlightAtom,
} from './backendState.atoms.ts';

export type VirtualSession = {
  readonly configValues: ConfigOptionValues;
  readonly cwd: string | undefined;
  readonly draft: string;
  readonly launchTarget: AgentLaunchTarget | undefined;
  /** Bound ACP session id after eager Bind; absent while unbound. */
  readonly sessionId?: string;
};

export type LastCreateDefaults = {
  readonly configValues: ConfigOptionValues;
  readonly launchTarget: AgentLaunchTarget;
};

export type EnsureVirtualSessionArg = {
  /** When set, write this cwd onto the blob (cwd-group (+) always; Create only when creating/re-selecting). */
  readonly cwd?: string;
  /**
   * When Selected is already Virtual, still patch `cwd` if provided (cwd-group (+)).
   * Create / (+) without this is a pure no-op when already Selected Virtual.
   */
  readonly patchCwdIfSelectedVirtual?: boolean;
};

/** Resolved Active session for Selected Session arm or Bound Virtual (cwd for FS listing). */
export type SelectedActiveSession = {
  readonly cwd: string | undefined;
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

export const virtualSessionAtom = Atom.make<null | VirtualSession>(null).pipe(Atom.keepAlive);

export const lastCreateDefaultsAtom = Atom.make<LastCreateDefaults | null>(null).pipe(Atom.keepAlive);

/** Bound id when Selected is Virtual; undefined for Session arm or unbound Virtual. */
export const selectedVirtualBoundSessionIdAtom = Atom.make(get => {
  if (get(selectedAtom)?._tag !== 'Virtual') {
    return undefined;
  }
  return get(virtualSessionAtom)?.sessionId;
}).pipe(Atom.keepAlive);

/**
 * Active session for Selected Session arm or Bound Virtual.
 * Does not widen `selectedSessionIdAtom` (Session-arm-only); use this for Triggers / FS / live Config.
 */
export const selectedActiveSessionAtom = Atom.make(get => {
  const selected = get(selectedAtom);
  if (selected?._tag === 'Virtual') {
    const virtual = get(virtualSessionAtom);
    if (virtual?.sessionId === undefined || virtual.launchTarget === undefined) {
      return undefined;
    }
    return {
      cwd: virtual.cwd,
      launchTarget: virtual.launchTarget,
      sessionId: virtual.sessionId,
    } satisfies SelectedActiveSession;
  }
  if (selected?._tag !== 'Session') {
    return undefined;
  }
  const { sessionId } = selected;
  const launchTarget = findLaunchTargetForSessionId(target => get(backendHarnessStateAtom(target)), sessionId);
  if (launchTarget === undefined) {
    return undefined;
  }
  const session = get(selectedSessionAtom);
  const sourceCwd = get(unifiedSessionRosterAtom).find(
    entry => entry.launchTarget === launchTarget && entry.sessionId === sessionId,
  )?.cwd;
  return {
    cwd: session?.cwd ?? sourceCwd,
    launchTarget,
    sessionId,
  } satisfies SelectedActiveSession;
}).pipe(Atom.keepAlive);

/** Session id from {@link selectedActiveSessionAtom}. */
export const selectedActiveSessionIdAtom = Atom.make(get => get(selectedActiveSessionAtom)?.sessionId).pipe(
  Atom.keepAlive,
);

type AtomRw = {
  readonly get: <A>(atom: Atom.Atom<A>) => A;
  readonly set: <R, W>(atom: Atom.Writable<R, W>, value: W) => void;
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

const emptyVirtual = (): VirtualSession => ({
  configValues: {},
  cwd: undefined,
  draft: '',
  launchTarget: undefined,
});

const seedFromLastDefaults = (rw: AtomRw): Pick<VirtualSession, 'configValues' | 'launchTarget'> => {
  const defaults = rw.get(lastCreateDefaultsAtom);
  if (defaults === null) {
    return { configValues: {}, launchTarget: undefined };
  }
  const index = rw.get(configOptionIndexAtom(defaults.launchTarget));
  return {
    configValues: sanitizeConfigValuesForIndex(index, defaults.configValues),
    launchTarget: defaults.launchTarget,
  };
};

type BoundRef = {
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

const boundRefOf = (virtual: null | VirtualSession): BoundRef | undefined =>
  virtual?.sessionId !== undefined && virtual.launchTarget !== undefined
    ? { launchTarget: virtual.launchTarget, sessionId: virtual.sessionId }
    : undefined;

/** Ensure one Virtual blob + Select Virtual. See EnsureVirtualSessionArg for cwd-group vs Create. */
export const ensureVirtualSession = (rw: AtomRw, arg: EnsureVirtualSessionArg = {}): void => {
  if (rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }

  const selected = rw.get(selectedAtom);
  const existing = rw.get(virtualSessionAtom);

  if (selected?._tag === 'Virtual') {
    if (arg.patchCwdIfSelectedVirtual === true && arg.cwd !== undefined && existing !== null) {
      rw.set(virtualSessionAtom, { ...existing, cwd: arg.cwd });
    }
    return;
  }

  if (existing !== null) {
    rw.set(virtualSessionAtom, arg.cwd !== undefined ? { ...existing, cwd: arg.cwd } : existing);
    rw.set(selectedAtom, { _tag: 'Virtual' });
    return;
  }

  const seeded = seedFromLastDefaults(rw);
  rw.set(virtualSessionAtom, {
    ...emptyVirtual(),
    ...seeded,
    cwd: arg.cwd,
  });
  rw.set(selectedAtom, { _tag: 'Virtual' });
};

export const discardVirtualSession = (rw: AtomRw): void => {
  if (rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }
  rw.set(virtualSessionAtom, null);
};

/** First-path Workspace folder churn: patch cwd + ensure Virtual, or discard when no cwd. */
export const applyVirtualSessionFolderChurn = (rw: AtomRw, nextCwd: string | undefined): void => {
  if (rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }
  if (nextCwd === undefined) {
    discardVirtualSession(rw);
    rw.set(selectedAtom, undefined);
    return;
  }
  ensureVirtualSession(rw, { cwd: nextCwd, patchCwdIfSelectedVirtual: true });
};

export const patchVirtualSession = (rw: AtomRw, patch: Partial<VirtualSession>): void => {
  if (rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }
  const current = rw.get(virtualSessionAtom);
  if (current === null) {
    return;
  }
  rw.set(virtualSessionAtom, { ...current, ...patch });
};

/** LT change on Virtual: Handoff-style hard reset; keep draft + cwd; clear Bound id when LT changes; prefer lastCreateDefaults when LT matches. */
export const setVirtualLaunchTarget = (rw: AtomRw, launchTarget: AgentLaunchTarget | undefined): void => {
  const current = rw.get(virtualSessionAtom);
  if (current === null || rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }
  if (launchTarget === current.launchTarget) {
    return;
  }
  if (launchTarget === undefined) {
    rw.set(virtualSessionAtom, {
      ...current,
      configValues: {},
      launchTarget: undefined,
      sessionId: undefined,
    });
    return;
  }
  const defaults = rw.get(lastCreateDefaultsAtom);
  if (defaults !== null && defaults.launchTarget === launchTarget) {
    const index = rw.get(configOptionIndexAtom(launchTarget));
    rw.set(virtualSessionAtom, {
      ...current,
      configValues: sanitizeConfigValuesForIndex(index, defaults.configValues),
      launchTarget,
      sessionId: undefined,
    });
    return;
  }
  const index = rw.get(configOptionIndexAtom(launchTarget));
  rw.set(virtualSessionAtom, {
    ...current,
    configValues: hardResetForAgent(index).values,
    launchTarget,
    sessionId: undefined,
  });
};

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

/** Eager Bind: session/new + sessions-map upsert + Virtual.sessionId; no roster. */
export const ensureVirtualAcpBound = Effect.fn('ensureVirtualAcpBound')(function* (rw: AtomRw) {
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

    const setOption = (diff: ConfigValueDiff) =>
      setConfigOption(
        launchTarget,
        boundSessionId,
        diff.configId,
        diff.type === 'boolean' ? { type: 'boolean', value: diff.value } : { type: 'select', value: diff.value },
      );
    const afterOverrides = yield* applyConfigDiffs(result, current.configValues, setOption);
    if (afterOverrides.stoppedEarly) {
      yield* Effect.logWarning('ensureVirtualAcpBound applyConfigDiffs stopped early', launchTarget, boundSessionId);
    }

    const configuredSnapshot = rw.get(backendHarnessStateAtom(launchTarget));
    rw.set(
      backendHarnessStateAtom(launchTarget),
      materializeIntoSnapshot(configuredSnapshot, {
        session: buildActivatedSession(boundSessionId, afterOverrides.sessionConfiguration, { cwd: createdCwd }),
      }),
    );

    const latest = rw.get(virtualSessionAtom);
    if (latest?.launchTarget !== launchTarget || latest.cwd !== cwd) {
      // Virtual churned during Bind — drop the orphan session best-effort.
      yield* teardownVirtualAcpBind(rw, { launchTarget, sessionId: boundSessionId });
      return;
    }
    rw.set(virtualSessionAtom, { ...latest, sessionId: boundSessionId });
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
 * Sync-mutate the Virtual blob, teardown Bound when cwd/LT/id no longer matches, optionally Bind again.
 * Atom fns and folder churn go through here instead of repeating teardown + ensure.
 */
export const mutateVirtualThenRebind = Effect.fn('mutateVirtualThenRebind')(function* (
  rw: AtomRw,
  options: {
    readonly mutate: (rw: AtomRw) => void;
    /** Call {@link ensureVirtualAcpBound} after mutate/teardown. Default true. */
    readonly rebind?: boolean;
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
    yield* ensureVirtualAcpBound(rw);
  }
});

/** Effect folder churn: teardown Bound on clear/swap, then sync mutate, then Bind when cwd present. */
export const applyVirtualSessionFolderChurnEffect = Effect.fn('applyVirtualSessionFolderChurnEffect')(function* (
  rw: AtomRw,
  nextCwd: string | undefined,
) {
  if (nextCwd === undefined) {
    yield* mutateVirtualThenRebind(rw, {
      mutate: inner => {
        discardVirtualSession(inner);
        inner.set(selectedAtom, undefined);
      },
      rebind: false,
    });
    return;
  }

  yield* mutateVirtualThenRebind(rw, {
    mutate: inner => {
      applyVirtualSessionFolderChurn(inner, nextCwd);
    },
  });
});

export const createVirtualSessionAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const ensureVirtualSessionAtomFn = atomRuntime
    .fn((arg: EnsureVirtualSessionArg | undefined, get: Atom.FnContext) =>
      mutateVirtualThenRebind(rwFromFnContext(get), {
        mutate: rw => {
          ensureVirtualSession(rw, arg ?? {});
        },
      }),
    )
    .pipe(Atom.keepAlive);

  const patchVirtualSessionAtomFn = atomRuntime
    .fn((patch: Partial<VirtualSession>, get: Atom.FnContext) => {
      const rw = rwFromFnContext(get);
      const before = rw.get(virtualSessionAtom);
      const cwdChanging = before !== null && patch.cwd !== undefined && patch.cwd !== before.cwd;
      return mutateVirtualThenRebind(rw, {
        mutate: inner => {
          patchVirtualSession(inner, patch);
        },
        // Draft/config patches must not re-enter Bind; cwd change always teardown + Bind.
        rebind: cwdChanging,
      });
    })
    .pipe(Atom.keepAlive);

  const setVirtualLaunchTargetAtomFn = atomRuntime
    .fn((launchTarget: AgentLaunchTarget | undefined, get: Atom.FnContext) =>
      mutateVirtualThenRebind(rwFromFnContext(get), {
        mutate: rw => {
          setVirtualLaunchTarget(rw, launchTarget);
        },
      }),
    )
    .pipe(Atom.keepAlive);

  const discardVirtualSessionAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) =>
      mutateVirtualThenRebind(rwFromFnContext(get), {
        mutate: rw => {
          discardVirtualSession(rw);
          rw.set(selectedAtom, undefined);
        },
        rebind: false,
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    discardVirtualSessionAtomFn,
    ensureVirtualSessionAtomFn,
    patchVirtualSessionAtomFn,
    setVirtualLaunchTargetAtomFn,
  };
};
