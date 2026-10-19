/** In-memory Virtual session blob + ensure / selection helpers (defer session/new until first send). */
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { hardResetForAgent, sanitizeConfigValuesForIndex } from '../host/configOptionIndexUi.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';

import { configOptionIndexAtom, selectedAtom, virtualMaterializeInFlightAtom } from './backendState.atoms.ts';

export type VirtualSession = {
  readonly configValues: ConfigOptionValues;
  readonly cwd: string | undefined;
  readonly draft: string;
  readonly launchTarget: AgentLaunchTarget | undefined;
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

type AtomRw = {
  readonly get: <A>(atom: Atom.Atom<A>) => A;
  readonly set: <R, W>(atom: Atom.Writable<R, W>, value: W) => void;
};

const rwFromFnContext = (get: Atom.FnContext): AtomRw => ({
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

/** Ensure one Virtual blob + Select Virtual. See EnsureVirtualSessionArg for cwd-group vs Create. */
export const ensureVirtualSession = (rw: AtomRw, arg: EnsureVirtualSessionArg = {}): void => {
  if (rw.get(virtualMaterializeInFlightAtom)) {
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
  if (rw.get(virtualMaterializeInFlightAtom)) {
    return;
  }
  rw.set(virtualSessionAtom, null);
};

/** First-path Workspace folder churn: patch cwd + ensure Virtual, or discard when no cwd. */
export const applyVirtualSessionFolderChurn = (rw: AtomRw, nextCwd: string | undefined): void => {
  if (rw.get(virtualMaterializeInFlightAtom)) {
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
  const current = rw.get(virtualSessionAtom);
  if (current === null) {
    return;
  }
  rw.set(virtualSessionAtom, { ...current, ...patch });
};

/** LT change on Virtual: Handoff-style hard reset; keep draft + cwd; prefer lastCreateDefaults when LT matches. */
export const setVirtualLaunchTarget = (rw: AtomRw, launchTarget: AgentLaunchTarget | undefined): void => {
  const current = rw.get(virtualSessionAtom);
  if (current === null || rw.get(virtualMaterializeInFlightAtom)) {
    return;
  }
  if (launchTarget === undefined) {
    rw.set(virtualSessionAtom, { ...current, configValues: {}, launchTarget: undefined });
    return;
  }
  const defaults = rw.get(lastCreateDefaultsAtom);
  if (defaults !== null && defaults.launchTarget === launchTarget) {
    const index = rw.get(configOptionIndexAtom(launchTarget));
    rw.set(virtualSessionAtom, {
      ...current,
      configValues: sanitizeConfigValuesForIndex(index, defaults.configValues),
      launchTarget,
    });
    return;
  }
  const index = rw.get(configOptionIndexAtom(launchTarget));
  rw.set(virtualSessionAtom, {
    ...current,
    configValues: hardResetForAgent(index).values,
    launchTarget,
  });
};

export const createVirtualSessionAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const ensureVirtualSessionAtomFn = atomRuntime
    .fn((arg: EnsureVirtualSessionArg | undefined, get: Atom.FnContext) =>
      Effect.sync(() => {
        ensureVirtualSession(rwFromFnContext(get), arg ?? {});
      }),
    )
    .pipe(Atom.keepAlive);

  const patchVirtualSessionAtomFn = atomRuntime
    .fn((patch: Partial<VirtualSession>, get: Atom.FnContext) =>
      Effect.sync(() => {
        patchVirtualSession(rwFromFnContext(get), patch);
      }),
    )
    .pipe(Atom.keepAlive);

  const setVirtualLaunchTargetAtomFn = atomRuntime
    .fn((launchTarget: AgentLaunchTarget | undefined, get: Atom.FnContext) =>
      Effect.sync(() => {
        setVirtualLaunchTarget(rwFromFnContext(get), launchTarget);
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    ensureVirtualSessionAtomFn,
    patchVirtualSessionAtomFn,
    setVirtualLaunchTargetAtomFn,
  };
};
