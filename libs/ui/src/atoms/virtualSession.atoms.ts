/** In-memory Virtual session blob + ensure / selection mutators + AtomFns. */
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { hardResetForAgent, sanitizeConfigValuesForIndex } from '../host/configOptionIndexUi.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';
import type { ComposerImageAttachment } from '../host/draftToContentBlocks.ts';

import { configOptionIndexAtom, selectedAtom, virtualLifecycleInFlightAtom } from './backendState.atoms.ts';
import type { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import type { AtomRw } from './virtualBind.ts';
import { mutateVirtualThenRebind, refreshFsListingViaRegistry, rwFromFnContext } from './virtualBind.ts';

type RefreshSessionFsListingAtomFn = ReturnType<typeof createSessionFsListingAtoms>['refreshSessionFsListingAtomFn'];

export type VirtualSession = {
  readonly attachments: readonly ComposerImageAttachment[];
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

export const virtualSessionAtom = Atom.make<null | VirtualSession>(null).pipe(Atom.keepAlive);

export const lastCreateDefaultsAtom = Atom.make<LastCreateDefaults | null>(null).pipe(Atom.keepAlive);

const emptyVirtual = (): VirtualSession => ({
  attachments: [],
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

/**
 * Leave Virtual Selected: best-effort Bound teardown + clear blob, then unset Selected.
 * No-op on lifecycle lock. Session-arm clear stays a Selected flip only.
 */
export const clearSelectedEffect = Effect.fn('clearSelectedEffect')(function* (rw: AtomRw) {
  if (rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }
  if (rw.get(selectedAtom)?._tag === 'Virtual') {
    yield* mutateVirtualThenRebind(rw, {
      mutate: inner => {
        discardVirtualSession(inner);
        inner.set(selectedAtom, undefined);
      },
      rebind: false,
    });
    return;
  }
  rw.set(selectedAtom, undefined);
});

/**
 * Select Session arm: if leaving Virtual, teardown Bound + clear blob first.
 * No-op on lifecycle lock.
 */
export const selectSessionEffect = Effect.fn('selectSessionEffect')(function* (rw: AtomRw, sessionId: string) {
  if (rw.get(virtualLifecycleInFlightAtom)) {
    return;
  }
  if (rw.get(selectedAtom)?._tag === 'Virtual') {
    yield* mutateVirtualThenRebind(rw, {
      mutate: inner => {
        discardVirtualSession(inner);
        inner.set(selectedAtom, { _tag: 'Session', sessionId });
      },
      rebind: false,
    });
    return;
  }
  rw.set(selectedAtom, { _tag: 'Session', sessionId });
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

export const createVirtualSessionAtoms = (
  runtime: HostRuntimeBag,
  refreshSessionFsListingAtomFn: RefreshSessionFsListingAtomFn,
) => {
  const { atomRuntime } = runtime;

  const refreshFsListing = (get: Atom.FnContext) =>
    refreshFsListingViaRegistry(get.registry, refreshSessionFsListingAtomFn);

  const ensureVirtualSessionAtomFn = atomRuntime
    .fn((arg: EnsureVirtualSessionArg | undefined, get: Atom.FnContext) =>
      mutateVirtualThenRebind(rwFromFnContext(get), {
        mutate: rw => {
          ensureVirtualSession(rw, arg ?? {});
        },
        refreshFsListing: refreshFsListing(get),
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
        refreshFsListing: refreshFsListing(get),
      });
    })
    .pipe(Atom.keepAlive);

  const setVirtualLaunchTargetAtomFn = atomRuntime
    .fn((launchTarget: AgentLaunchTarget | undefined, get: Atom.FnContext) =>
      mutateVirtualThenRebind(rwFromFnContext(get), {
        mutate: rw => {
          setVirtualLaunchTarget(rw, launchTarget);
        },
        refreshFsListing: refreshFsListing(get),
      }),
    )
    .pipe(Atom.keepAlive);

  const discardVirtualSessionAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) => clearSelectedEffect(rwFromFnContext(get)))
    .pipe(Atom.keepAlive);

  return {
    discardVirtualSessionAtomFn,
    ensureVirtualSessionAtomFn,
    patchVirtualSessionAtomFn,
    setVirtualLaunchTargetAtomFn,
  };
};
