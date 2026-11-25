/**
 * Virtual session: the one module that owns the Virtual blob, its Bind, Send pending, the Lifecycle lock and
 * Materialize (glossary: Virtual session → Bind → Send pending → Lifecycle lock → Materialize; Leaving Virtual).
 *
 * Interface:
 * - Read model (read-only): {@link virtualSessionAtom}, {@link virtualSendPendingAtom}, {@link virtualMaterializingAtom};
 *   {@link lastCreateDefaultsAtom} is the (writable) seed source for new blobs.
 * - Verbs, all taking the `AtomRegistry`: {@link ensureVirtual}, {@link editVirtual}, {@link updateVirtualDraft},
 *   {@link setVirtualLaunchTarget}, {@link setVirtualConfigOption}, {@link sendVirtual}, {@link select},
 *   {@link discardVirtual}.
 * - Provider hooks: {@link bindVirtualOnUsable}, {@link unbindVirtualOnConnectionLost},
 *   {@link resetVirtualOnProviderStopped}, {@link resetVirtualUnsupportedConfig}; Selected hygiene:
 *   {@link clearSelectedIfMissing}.
 * - AtomFns: {@link createVirtualSessionAtoms}.
 *
 * Invariants:
 * - Every write goes through the registry, so it lands even after the AtomFn that started it was re-invoked (a
 *   re-invoked AtomFn disposes its old `FnContext`, whose `set` then silently does nothing).
 * - Edits are inert while the Lifecycle lock is held; navigation never is.
 * - At most one live Bound session per blob: superseded and orphaned sessions are torn down in the background, and
 *   a failed teardown never blocks the next Bind or Send (ui ADR-0007, desktop ADR-0011 / ADR-0012).
 * - The draft survives every pre-Materialize failure.
 *
 * Review rule: write only from a value read in the same synchronous step, never from one read before a wait.
 */
import type { HostServices } from '@lib/context-services';
import { Deferred, Effect, Exit, Redacted } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';
import { ACP_LAUNCH_TARGET, ACP_SESSION_ID } from '@lib/hub/telemetryKeys';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import {
  effectiveVirtualValues,
  hardResetForAgent,
  needsLazyHydrate,
  resetUnsupportedConfigValues,
  rowForModel,
  sanitizeConfigValuesForIndex,
} from '../host/configOptionIndexUi.ts';
import { preserveConfigValuesOnModelChange } from '../host/configProbe.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from '../host/configProbe.ts';
import { bindSession, dropSession, dropSessionIfPresent } from '../host/harnessStateTransitions.ts';
import { normalizeSessionDirectories, sameDirectories } from '../host/sessionDirectories.ts';
import type { SessionDirectories } from '../host/sessionDirectories.ts';
import { historyEntryFromNew } from '../host/sessionMaterialize.ts';
import { closeOnAgent } from '../host/closeOnAgent.ts';
import { createSession, deleteSession } from '../host/sessionRpc.ts';
import { sessionCreated } from '../analytics/catalog.ts';
import { captureEvent } from '../analytics/trackEvent.ts';

import {
  backendHarnessSnapshotAtom,
  configOptionIndexAtom,
  findLaunchTargetForSessionId,
  ProviderUnavailable,
  requireLaunchTargetUsable,
  selectedAtom,
  showArchivedAtom,
} from './backendState.atoms.ts';
import type { Selected } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { modelPickerPrefsAtom } from './userSettings/userSettingsDocument.atoms.ts';
import { applyRecommendedValues, applySessionConfigValue, applySessionConfigValues } from './sessionConfigChange.ts';
import { trackSession } from './trackSession.ts';
import { refreshWorkspaceProject, requireProjectReady } from './workspaceFiles.atoms.ts';
import { sessionCwdAtom, workspaceDirectoriesAtom } from './workspaceFolderPaths.atoms.ts';
import { adoptIntoWorkstream, pendingWorkstreamAtom } from './workstreams.atoms.ts';
import { annotateLaunchTargetLogs, annotateSessionLogs } from '../host/sessionTelemetry.ts';

type Registry = AtomRegistry.AtomRegistry;

export type VirtualSession = SessionDirectories & {
  readonly attachments: readonly ComposerImageAttachment[];
  readonly configValues: ConfigOptionValues;
  readonly cwd: string | undefined;
  readonly draft: string;
  /** Identity of this blob: a new id each time a blob is created, so a discarded blob is never mistaken for its successor. */
  readonly id: string;
  readonly launchTarget: AgentLaunchTarget | undefined;
  /** Bound ACP session id after eager Bind; absent while unbound. */
  readonly sessionId?: string;
};

type LastCreateDefaults = {
  readonly configValues: ConfigOptionValues;
  readonly launchTarget: AgentLaunchTarget;
};

/** Where the blob starts: a plain cwd, or a desktop Project (exclusive). */
type EnsureVirtualSessionTarget =
  | {
      /** When set, write this cwd onto the blob (cwd-group (+) always; New Session only when creating/re-selecting). */
      readonly cwd?: string;
      readonly project?: never;
    }
  | {
      readonly cwd?: never;
      /**
       * A desktop Project (a directory or a Workspace file) to start in: resolved here (`resolveProject`) so only its first
       * folder is ever the cwd, with the other folders and the file replacing the blob's directories (a directory Project
       * clears them). Fails with {@link ProjectUnresolved} when the Project cannot be resolved.
       */
      readonly project: string;
    };

export type EnsureVirtualSessionArg = EnsureVirtualSessionTarget & {
  /**
   * When Selected is already Virtual, still patch `cwd` if provided (cwd-group (+)).
   * Create / (+) without this is a pure no-op when already Selected Virtual.
   */
  readonly patchCwdIfSelectedVirtual?: boolean;
};

/** What {@link ensureBlob} writes: the resolved cwd (never a Project path). */
type BlobTarget = { readonly cwd?: string; readonly patchCwdIfSelectedVirtual?: boolean };

/** Composer edits on the blob. A cwd or Additional directories (set) change tears down and rebinds; draft, attachment and workspace file edits never Bind. */
export type VirtualEdit = Partial<
  Pick<VirtualSession, 'additionalDirectories' | 'attachments' | 'cwd' | 'draft' | 'workspaceFile'>
>;

export type VirtualConfigOptionArg =
  | {
      readonly configId: string;
      readonly launchTarget: AgentLaunchTarget;
      readonly type: 'boolean';
      readonly value: boolean;
    }
  | {
      readonly configId: string;
      readonly launchTarget: AgentLaunchTarget;
      readonly type: 'select';
      readonly value: string;
    };

/** What Materialize hands to the prompt: the promoted Session and the draft that was on the blob. */
export type MaterializedVirtual = {
  readonly attachments: readonly ComposerImageAttachment[];
  readonly draft: string;
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

// Read model

const writableVirtualSessionAtom = Atom.make<null | VirtualSession>(null).pipe(Atom.keepAlive);

/** The Virtual blob, or `null`. Read-only; written only by this module's verbs. */
export const virtualSessionAtom: Atom.Atom<null | VirtualSession> = writableVirtualSessionAtom;

const writableSendPendingAtom = Atom.make(false).pipe(Atom.keepAlive);

/** Send pending: from pressing Send until Materialize ends (or the Send gives up). Blocks double-submit. */
export const virtualSendPendingAtom: Atom.Atom<boolean> = writableSendPendingAtom;

const writableMaterializingAtom = Atom.make(false).pipe(Atom.keepAlive);

/**
 * Lifecycle lock: true only while Materialize runs (Bind never takes it). Edits are inert while held; navigation
 * never waits on it. Released before the prompt is sent.
 */
export const virtualMaterializingAtom: Atom.Atom<boolean> = writableMaterializingAtom;

/** Seed source for new blobs (launch target + Config of the last Materialize). */
export const lastCreateDefaultsAtom = Atom.make<LastCreateDefaults | null>(null).pipe(Atom.keepAlive);

/** What a Bind is for: the provider + cwd + Additional directories (compared as a set) the Bound session is created with. */
type BindKey = {
  readonly additionalDirectories?: readonly string[];
  readonly cwd: string;
  readonly launchTarget: AgentLaunchTarget;
};

/** One Bind attempt. `done` resolves to the Bound id, or `undefined` when failed / superseded. */
type VirtualBind = BindKey & {
  /** Captured with the request, not part of the Bind key: recorded on the created Session, never sent to the Agent. */
  readonly workspaceFile?: string;
  readonly done: Deferred.Deferred<string | undefined>;
  readonly generation: number;
};

/** Latest-wins Bind bookkeeping: `latest` is the newest generation handed out; a Bind is current only while it matches. */
type VirtualBindState = {
  readonly current: undefined | VirtualBind;
  readonly latest: number;
};

const virtualBindAtom = Atom.make<VirtualBindState>({ current: undefined, latest: 0 }).pipe(Atom.keepAlive);

/** A Lazy hydrate pick on the wire; Send waits for it. Keyed by the target it started on. */
type PendingPick = {
  readonly done: Deferred.Deferred<undefined>;
  readonly key: string;
};

/** Every in-flight pick (overlapping picks all count); each removes only its own entry when it settles. */
const pendingPicksAtom = Atom.make<readonly PendingPick[]>([]).pipe(Atom.keepAlive);

/** Blob id + launch target + cwd + Bound session id: a pick only matches the exact target it started on. */
const pickKey = (virtual: VirtualSession): string =>
  `${virtual.id}:${virtual.launchTarget ?? ''}:${virtual.cwd ?? ''}:${virtual.sessionId ?? ''}`;

const setBlob = (registry: Registry, blob: null | VirtualSession): void => {
  registry.set(writableVirtualSessionAtom, blob);
  // A pending Workstream join belongs to one blob: dropping or replacing it abandons the join.
  const pending = registry.get(pendingWorkstreamAtom);
  if (pending !== null && pending.blobId !== blob?.id) registry.set(pendingWorkstreamAtom, null);
};

// Blob transitions (synchronous, inert under the Lifecycle lock)

const emptyVirtual = (): VirtualSession => ({
  attachments: [],
  configValues: {},
  cwd: undefined,
  draft: '',
  id: crypto.randomUUID(),
  launchTarget: undefined,
});

/** Composer has typed text or attachments (same test Materialize uses for a sendable draft). */
const hasComposerContent = (virtual: Pick<VirtualSession, 'attachments' | 'draft'>): boolean =>
  virtual.draft.trim().length > 0 || virtual.attachments.length > 0;

const seedFromLastDefaults = (registry: Registry): Pick<VirtualSession, 'configValues' | 'launchTarget'> => {
  const defaults = registry.get(lastCreateDefaultsAtom);
  if (defaults === null) {
    return { configValues: {}, launchTarget: undefined };
  }
  const index = registry.get(configOptionIndexAtom(defaults.launchTarget));
  return {
    configValues: sanitizeConfigValuesForIndex(
      index,
      defaults.configValues,
      registry.get(modelPickerPrefsAtom(defaults.launchTarget)),
    ),
    launchTarget: defaults.launchTarget,
  };
};

/**
 * Ensure one Virtual blob + Select Virtual. See EnsureVirtualSessionArg for cwd-group vs Create. `directories` are the
 * Additional directories and Workspace file of a Workspace project `arg.cwd` was resolved from.
 */
const ensureBlob = (registry: Registry, arg: BlobTarget, directories?: SessionDirectories): void => {
  if (registry.get(virtualMaterializingAtom)) {
    return;
  }

  const selected = registry.get(selectedAtom);
  const existing = registry.get(virtualSessionAtom);
  // A blob on the Workspace cwd carries the workspace's Additional directories and workspace file. The cwd must be
  // defined: with no Workspace folder (or on desktop) both sides are undefined and a blob is never stamped with directories.
  // A resolved desktop Project's directories (possibly none) replace the blob's.
  const withDirectories = (blob: VirtualSession): VirtualSession => {
    const carried =
      directories ??
      (arg.cwd !== undefined && arg.cwd === registry.get(sessionCwdAtom)
        ? registry.get(workspaceDirectoriesAtom)
        : undefined);
    return carried === undefined
      ? blob
      : { ...blob, additionalDirectories: carried.additionalDirectories, workspaceFile: carried.workspaceFile };
  };

  if (selected?._tag === 'Virtual') {
    if (arg.patchCwdIfSelectedVirtual === true && arg.cwd !== undefined && existing !== null) {
      setBlob(registry, withDirectories({ ...existing, cwd: arg.cwd }));
    }
    return;
  }

  if (existing !== null) {
    setBlob(registry, arg.cwd !== undefined ? withDirectories({ ...existing, cwd: arg.cwd }) : existing);
    registry.set(selectedAtom, { _tag: 'Virtual' });
    return;
  }

  setBlob(registry, withDirectories({ ...emptyVirtual(), ...seedFromLastDefaults(registry), cwd: arg.cwd }));
  registry.set(selectedAtom, { _tag: 'Virtual' });
};

const patchBlob = (registry: Registry, patch: Partial<VirtualSession>): void => {
  if (registry.get(virtualMaterializingAtom)) {
    return;
  }
  const current = registry.get(virtualSessionAtom);
  if (current === null) {
    return;
  }
  setBlob(registry, { ...current, ...patch });
};

const discardBlob = (registry: Registry): void => {
  if (registry.get(virtualMaterializingAtom)) {
    return;
  }
  setBlob(registry, null);
};

/** LT change: Handoff-style hard reset; keep draft + cwd; clear Bound id; prefer lastCreateDefaults when LT matches. */
const setBlobLaunchTarget = (registry: Registry, launchTarget: AgentLaunchTarget | undefined): void => {
  const current = registry.get(virtualSessionAtom);
  if (current === null || registry.get(virtualMaterializingAtom)) {
    return;
  }
  if (launchTarget === current.launchTarget) {
    return;
  }
  if (launchTarget === undefined) {
    setBlob(registry, { ...current, configValues: {}, launchTarget: undefined, sessionId: undefined });
    return;
  }
  const index = registry.get(configOptionIndexAtom(launchTarget));
  const defaults = registry.get(lastCreateDefaultsAtom);
  const prefs = registry.get(modelPickerPrefsAtom(launchTarget));
  const configValues =
    defaults?.launchTarget === launchTarget
      ? sanitizeConfigValuesForIndex(index, defaults.configValues, prefs)
      : hardResetForAgent(index, prefs).values;
  setBlob(registry, { ...current, configValues, launchTarget, sessionId: undefined });
};

/** Blob-only Config write. A model change re-derives the other options from the new model's rows. */
const patchBlobConfigValue = (
  registry: Registry,
  index: ConfigOptionIndex | undefined,
  configId: string,
  value: boolean | string,
): void => {
  const configValues = registry.get(virtualSessionAtom)?.configValues ?? {};
  patchBlob(registry, {
    configValues:
      configId === 'model' && typeof value === 'string' && index !== undefined
        ? preserveConfigValuesOnModelChange({ ...configValues, model: value }, rowForModel(index, value))
        : { ...configValues, [configId]: value },
  });
};

// Bind (optimistic, latest-wins; ui ADR-0007)

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

/** Same Bind key: launch target, cwd and Additional directories (as a set). */
const sameBindKey = (a: Partial<BindKey> | null | undefined, b: Partial<BindKey> | null | undefined): boolean =>
  a?.launchTarget === b?.launchTarget &&
  a?.cwd === b?.cwd &&
  sameDirectories(a?.additionalDirectories, b?.additionalDirectories);

const bindKeyMatches = (virtual: null | VirtualSession, key: BindKey): boolean =>
  virtual !== null && sameBindKey(virtual, key);

/** Best-effort close+delete Bound session (no session dir). Failed delete must not block replacement Bind. */
const teardownBound = Effect.fn('teardownBound')(function* (registry: Registry, bound: BoundRef) {
  const snapshot = registry.get(backendHarnessSnapshotAtom(bound.launchTarget));
  const session = bound.sessionId in snapshot.sessions ? snapshot.sessions[bound.sessionId] : undefined;
  if (session !== undefined && session.status !== 'inactive') {
    yield* Effect.exit(closeOnAgent(snapshot.agentCapabilities, bound.launchTarget, bound.sessionId));
  }
  // Deleted whatever the agent advertises (best-effort): a never-Materialized draft must not linger in the agent's
  // `session/list`, where Import would offer it.
  yield* Effect.exit(deleteSession(bound.launchTarget, bound.sessionId));

  updateHarnessSnapshot(registry, bound.launchTarget, current => dropSessionIfPresent(current, bound.sessionId));

  const virtual = registry.get(virtualSessionAtom);
  if (virtual?.sessionId === bound.sessionId) {
    setBlob(registry, { ...virtual, sessionId: undefined });
  }
});

/** Clear the Bound id on the blob now and tear the old session down in the background (never blocks Bind/Send). */
const releaseBoundInBackground = Effect.fn('releaseBoundInBackground')(function* (registry: Registry, bound: BoundRef) {
  const virtual = registry.get(virtualSessionAtom);
  if (virtual?.sessionId === bound.sessionId) {
    setBlob(registry, { ...virtual, sessionId: undefined });
  }
  yield* Effect.forkDetach(teardownBound(registry, bound));
});

/** One Bind attempt: `session/new` + sessions-map upsert; discards (tears down) its session when superseded. */
const runBind = Effect.fn('runBind')(function* (registry: Registry, bind: VirtualBind) {
  const { additionalDirectories, cwd, launchTarget, workspaceFile } = bind;
  yield* Effect.annotateCurrentSpan({ [ACP_LAUNCH_TARGET]: launchTarget });
  yield* Effect.logInfo('UI runBind').pipe(
    Effect.annotateLogs({ cwd: Redacted.make(cwd) }),
    annotateLaunchTargetLogs(launchTarget),
  );

  const createExit = yield* Effect.exit(createSession(launchTarget, cwd, { additionalDirectories, workspaceFile }));
  if (Exit.isFailure(createExit)) {
    yield* Effect.logError('runBind session/new failed', createExit.cause).pipe(annotateLaunchTargetLogs(launchTarget));
    return undefined;
  }

  const { cwd: createdCwd, directories, result } = createExit.value;
  const boundSessionId = result.sessionId;
  yield* Effect.annotateCurrentSpan(ACP_SESSION_ID, boundSessionId);

  updateHarnessSnapshot(registry, launchTarget, current =>
    bindSession(current, { cwd: createdCwd, directories, result }),
  );

  const latest = registry.get(virtualSessionAtom);
  if (registry.get(virtualBindAtom).latest !== bind.generation || latest === null || !bindKeyMatches(latest, bind)) {
    // Superseded or Virtual churned during Bind — drop the orphan session best-effort.
    yield* teardownBound(registry, { launchTarget, sessionId: boundSessionId });
    return undefined;
  }
  setBlob(registry, { ...latest, sessionId: boundSessionId });
  yield* Effect.logInfo('UI runBind complete').pipe(annotateSessionLogs(launchTarget, boundSessionId));
  return boundSessionId;
});

/**
 * Request a Bind for the current Virtual blob without waiting for it. Latest-wins: a request with a new
 * `{launchTarget, cwd, Additional directories}` supersedes any in-flight Bind (its session is torn down when it lands); the same key joins it.
 * Returns `undefined` when nothing needs binding (unusable, no valid key, already Bound, Materializing).
 */
const requestBind = Effect.fn('requestBind')(function* (registry: Registry) {
  if (registry.get(virtualMaterializingAtom)) {
    return undefined;
  }

  const virtual = registry.get(virtualSessionAtom);
  if (virtual === null) {
    return undefined;
  }
  const { additionalDirectories, cwd, launchTarget, sessionId, workspaceFile } = virtual;
  if (launchTarget === undefined || cwd === undefined || !isAbsoluteCwd(cwd)) {
    return undefined;
  }
  const snapshot = registry.get(backendHarnessSnapshotAtom(launchTarget));
  if (!isUsablePhase(snapshot.phase)) {
    return undefined;
  }
  if (
    sessionId !== undefined &&
    sessionId in snapshot.sessions &&
    snapshot.sessions[sessionId].cwd === cwd &&
    sameDirectories(snapshot.sessions[sessionId].additionalDirectories, additionalDirectories)
  ) {
    return undefined;
  }

  const state = registry.get(virtualBindAtom);
  if (state.current !== null && sameBindKey(state.current, { additionalDirectories, cwd, launchTarget })) {
    return state.current;
  }

  if (sessionId !== undefined) {
    yield* releaseBoundInBackground(registry, { launchTarget, sessionId });
  }

  const bind: VirtualBind = {
    additionalDirectories,
    cwd,
    done: yield* Deferred.make<string | undefined>(),
    generation: state.latest + 1,
    launchTarget,
    workspaceFile,
  };
  registry.set(virtualBindAtom, { current: bind, latest: bind.generation });

  // Detached: a re-invoked AtomFn must not interrupt a `session/new` already on the wire.
  yield* Effect.forkDetach(
    runBind(registry, bind).pipe(
      Effect.tapError(error => Effect.logError('requestBind runBind failed', error)),
      Effect.catchCause(() => Effect.succeed(undefined)),
      Effect.tap(boundSessionId => Deferred.succeed(bind.done, boundSessionId)),
      Effect.ensuring(
        Effect.sync(() => {
          const after = registry.get(virtualBindAtom);
          if (after.current?.generation === bind.generation) {
            registry.set(virtualBindAtom, { ...after, current: undefined });
          }
        }),
      ),
    ),
  );
  return bind;
});

/** Resolves once `bind` is no longer the current Bind (superseded, or settled and cleared). */
const awaitBindSuperseded = (registry: Registry, bind: VirtualBind) =>
  Effect.callback<undefined>(resume => {
    const superseded = () => registry.get(virtualBindAtom).current !== bind;
    if (superseded()) {
      resume(Effect.succeed(undefined));
      return;
    }
    const unsubscribe = registry.subscribe(virtualBindAtom, () => {
      if (superseded()) {
        unsubscribe();
        resume(Effect.succeed(undefined));
      }
    });
    return Effect.sync(unsubscribe);
  });

/**
 * Wait for the newest Bind to settle (re-awaiting if a newer one supersedes it meanwhile).
 * Resolves to the Bound id on the blob, or `undefined` when nothing is bound.
 */
const awaitCurrentBind = Effect.fn('awaitCurrentBind')(function* (registry: Registry) {
  let awaited: undefined | VirtualBind;
  for (;;) {
    const { current } = registry.get(virtualBindAtom);
    if (current === undefined || current === awaited) {
      return registry.get(virtualSessionAtom)?.sessionId;
    }
    awaited = current;
    yield* Effect.raceFirst(Deferred.await(current.done), awaitBindSuperseded(registry, current));
  }
});

/**
 * Sync-mutate Virtual, release the Bound session in the background when cwd/LT/id no longer matches, then
 * optionally request a Bind. Never waits on a Bind. Inert under the Lifecycle lock.
 */
const mutateThenRebind = Effect.fn('mutateThenRebind')(function* (
  registry: Registry,
  options: {
    readonly mutate: () => void;
    /** Request a Bind after mutate/teardown. Default true. */
    readonly rebind?: boolean;
  },
) {
  if (registry.get(virtualMaterializingAtom)) {
    return;
  }

  const before = registry.get(virtualSessionAtom);
  const oldBound = boundRefOf(before);

  options.mutate();

  const after = registry.get(virtualSessionAtom);
  if (oldBound !== undefined) {
    const stillBound = after !== null && after.sessionId === oldBound.sessionId && sameBindKey(after, before);
    if (!stillBound) {
      yield* releaseBoundInBackground(registry, oldBound);
    }
  }

  if (options.rebind !== false) {
    yield* requestBind(registry);
  }
});

// Send pending → Lifecycle lock → Materialize

/** Wait until the provider is usable or errored, or the blob moved off `launchTarget` (whichever comes first). */
const awaitProviderSettled = (registry: Registry, launchTarget: AgentLaunchTarget) =>
  Effect.callback<undefined>(resume => {
    const unsubscribes: (() => void)[] = [];
    const cleanup = () => {
      unsubscribes.forEach(unsubscribe => {
        unsubscribe();
      });
    };
    const settled = () => {
      const { phase } = registry.get(backendHarnessSnapshotAtom(launchTarget));
      return (
        isUsablePhase(phase) || phase === 'error' || registry.get(virtualSessionAtom)?.launchTarget !== launchTarget
      );
    };
    const check = () => {
      if (settled()) {
        cleanup();
        resume(Effect.succeed(undefined));
      }
    };
    if (settled()) {
      resume(Effect.succeed(undefined));
      return;
    }
    unsubscribes.push(
      registry.subscribe(backendHarnessSnapshotAtom(launchTarget), check),
      registry.subscribe(virtualSessionAtom, check),
    );
    return Effect.sync(cleanup);
  });

/** Resolves once the blob no longer has the pick key `key` (provider / cwd / Bound id / blob churn). */
const awaitPickTargetChanged = (registry: Registry, key: string) =>
  Effect.callback<undefined>(resume => {
    const changed = () => {
      const current = registry.get(virtualSessionAtom);
      return current === null || pickKey(current) !== key;
    };
    if (changed()) {
      resume(Effect.succeed(undefined));
      return;
    }
    const unsubscribe = registry.subscribe(virtualSessionAtom, () => {
      if (changed()) {
        unsubscribe();
        resume(Effect.succeed(undefined));
      }
    });
    return Effect.sync(unsubscribe);
  });

/** A Virtual draft with content, a Bound session, and the cwd / launch target it was Bound for. */
type BoundVirtualTarget = VirtualSession &
  BindKey & {
    readonly sessionId: string;
  };

/**
 * Send gate: wait for the provider to be usable, then for the latest Bind (requesting one if none is in flight).
 * Follows the blob when provider / cwd churn mid-wait. Resolves to the Bound draft, or `undefined` when there is
 * nothing to send (no blob, no cwd / launch target, or the draft was cleared). Fails with {@link ProviderUnavailable}
 * on a provider `error` phase or when the Bind failed.
 */
const awaitBoundVirtual = Effect.fn('awaitBoundVirtual')(function* (
  registry: Registry,
): Effect.fn.Return<BoundVirtualTarget | undefined, ProviderUnavailable> {
  for (;;) {
    const virtual = registry.get(virtualSessionAtom);
    if (virtual?.launchTarget === undefined || virtual.cwd === undefined || !hasComposerContent(virtual)) {
      return undefined;
    }
    const { additionalDirectories, cwd, launchTarget } = virtual;
    const key: BindKey = { additionalDirectories, cwd, launchTarget };
    const { failure, phase } = registry.get(backendHarnessSnapshotAtom(launchTarget));
    if (phase === 'error') {
      return yield* new ProviderUnavailable({ message: failure?.message ?? 'Provider unavailable' });
    }
    if (!isUsablePhase(phase)) {
      yield* awaitProviderSettled(registry, launchTarget);
    } else {
      yield* requestBind(registry);
      const boundId = yield* awaitCurrentBind(registry);
      const latest = registry.get(virtualSessionAtom);
      const targetKey = latest === null ? undefined : pickKey(latest);
      const picks = registry.get(pendingPicksAtom).filter(pick => pick.key === targetKey);
      if (targetKey !== undefined && picks.length > 0) {
        // Lazy hydrate picks for this exact target are on the wire: let them all land (or the target churn), then loop.
        yield* Effect.raceFirst(
          Effect.forEach(picks, pick => Deferred.await(pick.done), { discard: true }),
          awaitPickTargetChanged(registry, targetKey),
        );
      } else if (latest !== null && bindKeyMatches(latest, key)) {
        // (Blob churned (provider / cwd) while awaiting → loop and follow the newest Bind.)
        if (boundId === undefined || latest.sessionId !== boundId) {
          return yield* new ProviderUnavailable({ message: 'Could not start a session for this provider' });
        }
        // Draft cleared while awaiting → nothing left to send.
        return hasComposerContent(latest) ? { ...latest, ...key, sessionId: boundId } : undefined;
      }
    }
  }
});

/** The Bound session is in the snapshot and active. */
const isLiveActive = (snapshot: BackendHarnessSnapshot, sessionId: string): boolean =>
  sessionId in snapshot.sessions && snapshot.sessions[sessionId].status === 'active';

/**
 * Under the Lifecycle lock: apply Virtual Config diffs to the Bound session (each response folded into the latest
 * snapshot; `stoppedEarly` continues), upsert the History row, record last-create defaults, clear the blob, and Select the Session only if Selected is still Virtual.
 */
const materialize = Effect.fn('materialize')(
  function* (registry: Registry, target: BoundVirtualTarget) {
    const { attachments, cwd, draft, launchTarget, sessionId } = target;
    // Recommended values fill what the blob leaves unset (a fresh blob is `{}`); blob picks win.
    const configValues = effectiveVirtualValues(
      registry.get(configOptionIndexAtom(launchTarget)),
      registry.get(modelPickerPrefsAtom(launchTarget)),
      target.configValues,
    );
    registry.set(writableMaterializingAtom, true);
    yield* Effect.annotateCurrentSpan({ [ACP_LAUNCH_TARGET]: launchTarget });
    yield* Effect.annotateCurrentSpan(ACP_SESSION_ID, sessionId);
    yield* Effect.logInfo('UI materialize').pipe(
      Effect.annotateLogs({ cwd: Redacted.make(cwd) }),
      annotateSessionLogs(launchTarget, sessionId),
    );

    const liveSnapshot = registry.get(backendHarnessSnapshotAtom(launchTarget));
    if (!isLiveActive(liveSnapshot, sessionId)) {
      yield* Effect.logError('materialize missing Bound session').pipe(annotateSessionLogs(launchTarget, sessionId));
      return undefined;
    }
    const liveSession = liveSnapshot.sessions[sessionId];

    const afterOverrides = yield* applySessionConfigValues(registry, { launchTarget, sessionId }, configValues);
    // Options the model set revealed (not hydrated in the index) still start on their Recommended value.
    const afterRecommended = afterOverrides.stoppedEarly
      ? afterOverrides
      : yield* applyRecommendedValues(registry, { launchTarget, sessionId }, new Set(Object.keys(target.configValues)));
    if (afterRecommended.stoppedEarly) {
      yield* Effect.logWarning('materialize Config diffs stopped early').pipe(
        annotateSessionLogs(launchTarget, sessionId),
      );
    }

    // The connection may have died during the RPCs: keep the blob (draft, attachments) and only forget the dead id.
    const afterSnapshot = registry.get(backendHarnessSnapshotAtom(launchTarget));
    if (!isUsablePhase(afterSnapshot.phase) || !isLiveActive(afterSnapshot, sessionId)) {
      const virtual = registry.get(virtualSessionAtom);
      if (virtual?.sessionId === sessionId) {
        setBlob(registry, { ...virtual, sessionId: undefined });
      }
      return yield* new ProviderUnavailable({ message: 'Provider connection lost while starting the session' });
    }

    const historyEntry = historyEntryFromNew(
      { sessionId },
      liveSession.cwd ?? cwd,
      // The Virtual blob's own directories, never the Bound session's possibly stale ones.
      normalizeSessionDirectories(target),
    );
    if (historyEntry !== undefined) {
      yield* trackSession(registry, launchTarget, historyEntry);
      // A session started from "New session in Workstream" belongs to it from creation.
      const pending = registry.get(pendingWorkstreamAtom);
      if (pending !== null && pending.blobId === registry.get(virtualSessionAtom)?.id) {
        yield* adoptIntoWorkstream(registry, pending.workstreamId, { launchTarget, sessionId }).pipe(
          Effect.catchCause(cause => Effect.logWarning('adopt new session into Workstream failed', cause)),
        );
      }
    }
    registry.set(pendingWorkstreamAtom, null);

    registry.set(lastCreateDefaultsAtom, { configValues, launchTarget });
    setBlob(registry, null);
    // User may have navigated away mid-Materialize; only follow the draft if still on Virtual.
    if (registry.get(selectedAtom)?._tag === 'Virtual') {
      registry.set(selectedAtom, { _tag: 'Session', sessionId });
    }
    yield* captureEvent(sessionCreated(launchTarget));
    return { attachments, draft, launchTarget, sessionId } satisfies MaterializedVirtual;
  },
  (effect, registry) =>
    effect.pipe(
      Effect.tapError(error => Effect.logError('materialize failed', error)),
      Effect.ensuring(
        Effect.sync(() => {
          registry.set(writableMaterializingAtom, false);
        }),
      ),
    ),
);

// Verbs

/** New Session / cwd-group (+) / boot: Select Virtual, creating or seeding the blob, then Bind. */
export const ensureVirtual = Effect.fn('ensureVirtual')(function* (
  registry: Registry,
  arg: EnsureVirtualSessionArg = {},
) {
  // A Workspace file is never a cwd: resolve a Project to its first folder + Additional directories before anything binds.
  const project = arg.project === undefined ? undefined : yield* requireProjectReady(registry, arg.project);
  yield* mutateThenRebind(registry, {
    mutate: () => {
      ensureBlob(
        registry,
        {
          cwd: project === undefined ? arg.cwd : project.cwd,
          patchCwdIfSelectedVirtual: arg.patchCwdIfSelectedVirtual,
        },
        project === undefined
          ? undefined
          : normalizeSessionDirectories({
              additionalDirectories: project.additionalDirectories,
              workspaceFile: project.workspaceFile,
            }),
      );
    },
  });
});

/** Draft, attachments, cwd or Additional directories. Only a cwd or directories (set) change tears down the Bound session and rebinds. */
export const editVirtual = Effect.fn('editVirtual')(function* (registry: Registry, edit: VirtualEdit) {
  const before = registry.get(virtualSessionAtom);
  yield* mutateThenRebind(registry, {
    mutate: () => {
      patchBlob(registry, edit);
      // The workspace file is not part of the Bind key: keep an already Bound session's copy current in place.
      const { launchTarget, sessionId } = before ?? {};
      if (
        'workspaceFile' in edit &&
        edit.workspaceFile !== before?.workspaceFile &&
        launchTarget !== undefined &&
        sessionId !== undefined &&
        !registry.get(virtualMaterializingAtom)
      ) {
        updateHarnessSnapshot(registry, launchTarget, current => {
          if (!(sessionId in current.sessions)) {
            return current;
          }
          const { workspaceFile: _stale, ...rest } = current.sessions[sessionId];
          return {
            ...current,
            sessions: {
              ...current.sessions,
              [sessionId]: {
                ...rest,
                ...(edit.workspaceFile === undefined ? {} : { workspaceFile: edit.workspaceFile }),
              },
            },
          };
        });
      }
    },
    rebind:
      before !== null &&
      ((edit.cwd !== undefined && edit.cwd !== before.cwd) ||
        (edit.additionalDirectories !== undefined &&
          !sameDirectories(edit.additionalDirectories, before.additionalDirectories))),
  });
});

/**
 * Picks a Project for the Virtual session (the Composer's Project picker): its resolved cwd, Additional directories and
 * Workspace file replace the blob's, so a directory Project clears a Workspace project's. Fails with
 * {@link ProjectUnresolved} for a Workspace project whose file cannot be resolved.
 */
export const selectVirtualProject = Effect.fn('selectVirtualProject')(function* (registry: Registry, project: string) {
  const resolved = yield* requireProjectReady(registry, project);
  yield* editVirtual(registry, {
    additionalDirectories: [...resolved.additionalDirectories],
    cwd: resolved.cwd,
    workspaceFile: resolved.workspaceFile,
  });
});

/**
 * Draft / attachment edit computed from the blob's latest draft, in one synchronous step (the Composer's write path).
 * `update` returns `undefined` for no change. Inert when the blob is not `blobId` (none, or a newer one) or under the
 * Lifecycle lock. Never Binds.
 */
export const updateVirtualDraft = (
  registry: Registry,
  blobId: string | undefined,
  update: (
    current: Pick<VirtualSession, 'attachments' | 'draft'>,
  ) => Partial<Pick<VirtualSession, 'attachments' | 'draft'>> | undefined,
): void => {
  const current = registry.get(virtualSessionAtom);
  if (current === null || current.id !== blobId || registry.get(virtualMaterializingAtom)) {
    return;
  }
  const patch = update(current);
  if (patch !== undefined) {
    patchBlob(registry, patch);
  }
};

/** Launch target change: hard reset (or last-create defaults), tear down + rebind. Fails when the provider is unusable. */
export const setVirtualLaunchTarget = Effect.fn('setVirtualLaunchTarget')(function* (
  registry: Registry,
  launchTarget: AgentLaunchTarget | undefined,
) {
  const blocked =
    launchTarget === undefined ? undefined : requireLaunchTargetUsable(atom => registry.get(atom), launchTarget);
  if (blocked !== undefined) {
    return yield* blocked;
  }
  yield* mutateThenRebind(registry, {
    mutate: () => {
      setBlobLaunchTarget(registry, launchTarget);
    },
  });
});

/**
 * Config while Selected is Virtual (Bound or not): blob only; Materialize applies diffs to the live session on Send.
 * Exception (Lazy hydrate): an advertised model with no hydrated row yet is picked on the Bound session first (recorded
 * on its Session configuration) so its row is learned; if that pick fails nothing is written.
 */
export const setVirtualConfigOption = Effect.fn('setVirtualConfigOption')(function* (
  registry: Registry,
  arg: VirtualConfigOptionArg,
) {
  const before = registry.get(virtualSessionAtom);
  const boundSessionId = before?.sessionId;
  if (
    before !== null &&
    arg.type === 'select' &&
    arg.configId === 'model' &&
    boundSessionId !== undefined &&
    needsLazyHydrate(registry.get(configOptionIndexAtom(arg.launchTarget)), boundSessionId, arg.value)
  ) {
    const pending: PendingPick = { done: yield* Deferred.make<undefined>(), key: pickKey(before) };
    registry.set(pendingPicksAtom, [...registry.get(pendingPicksAtom), pending]);
    // `done` completes only after the target guard + patch, so a waiting Send never re-reads a stale blob.
    yield* Effect.gen(function* () {
      const pick = yield* Effect.exit(
        applySessionConfigValue(
          registry,
          { launchTarget: arg.launchTarget, sessionId: boundSessionId },
          { configId: 'model', type: 'select', value: arg.value },
        ),
      );
      if (Exit.isFailure(pick)) {
        return;
      }
      // The response hydrated the originating provider's cache; the draft only follows if the target is unchanged.
      const after = registry.get(virtualSessionAtom);
      if (
        after?.id !== before.id ||
        after.launchTarget !== before.launchTarget ||
        after.cwd !== before.cwd ||
        after.sessionId !== boundSessionId
      ) {
        return;
      }
      patchBlobConfigValue(registry, registry.get(configOptionIndexAtom(arg.launchTarget)), arg.configId, arg.value);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          registry.set(
            pendingPicksAtom,
            registry.get(pendingPicksAtom).filter(entry => entry !== pending),
          );
          Deferred.doneUnsafe(pending.done, Exit.succeed(undefined));
        }),
      ),
    );
    return;
  }
  patchBlobConfigValue(registry, registry.get(configOptionIndexAtom(arg.launchTarget)), arg.configId, arg.value);
});

/**
 * First Send on Virtual: Send pending → await provider `usable` and the latest Bind (requesting one if none,
 * re-awaiting when the blob churns) → Lifecycle lock → Materialize → release the lock → `prompt`. The draft stays on
 * the blob until Materialize succeeds. Resolves without prompting when there is nothing to send (no blob, no content,
 * not Selected, already pending, or locked). Fails with {@link ProviderUnavailable} on provider `error` or a failed Bind.
 */
export const sendVirtual = Effect.fn('sendVirtual')(function* <E, R>(
  registry: Registry,
  prompt: (materialized: MaterializedVirtual) => Effect.Effect<unknown, E, R>,
): Effect.fn.Return<void, E | ProviderUnavailable, R | HostServices> {
  if (
    registry.get(virtualMaterializingAtom) ||
    registry.get(virtualSendPendingAtom) ||
    registry.get(selectedAtom)?._tag !== 'Virtual'
  ) {
    return;
  }
  const initial = registry.get(virtualSessionAtom);
  if (initial === null || !hasComposerContent(initial)) {
    return;
  }

  registry.set(writableSendPendingAtom, true);
  const materialized = yield* awaitBoundVirtual(registry).pipe(
    Effect.flatMap(target => (target === undefined ? Effect.succeed(undefined) : materialize(registry, target))),
    Effect.ensuring(
      Effect.sync(() => {
        registry.set(writableSendPendingAtom, false);
      }),
    ),
  );
  if (materialized !== undefined) {
    yield* prompt(materialized);
  }
});

/** Leaving Virtual: content keeps the blob (+ Bound); empty discards it with background teardown. Never waits. */
const leaveVirtual = Effect.fn('leaveVirtual')(function* (registry: Registry, next: Selected | undefined) {
  // Navigating away abandons a pending Workstream join (Materialize still needs it, so not while it holds the lock).
  if (!registry.get(virtualMaterializingAtom)) registry.set(pendingWorkstreamAtom, null);
  const virtual = registry.get(virtualSessionAtom);
  if (virtual !== null && hasComposerContent(virtual)) {
    registry.set(selectedAtom, next);
    return;
  }
  if (registry.get(virtualMaterializingAtom)) {
    // Materialize promotes the Bound session; drop the blob without teardown.
    setBlob(registry, null);
    registry.set(selectedAtom, next);
    return;
  }
  yield* mutateThenRebind(registry, {
    mutate: () => {
      discardBlob(registry);
      registry.set(selectedAtom, next);
    },
    rebind: false,
  });
});

/** Navigation: Select a Session or clear Selected. When Selected is Virtual this is Leaving Virtual. */
export const select = Effect.fn('select')(function* (
  registry: Registry,
  next: Extract<Selected, { readonly _tag: 'Session' }> | undefined,
) {
  if (registry.get(selectedAtom)?._tag === 'Virtual') {
    yield* leaveVirtual(registry, next);
    return;
  }
  registry.set(selectedAtom, next);
});

/** Resolves once no Bind is in flight and no Materialize holds the Lifecycle lock. */
export const awaitVirtualSettled = (registry: Registry) =>
  Effect.callback<undefined>(resume => {
    const settled = () =>
      registry.get(virtualBindAtom).current === undefined && !registry.get(virtualMaterializingAtom);
    if (settled()) {
      resume(Effect.succeed(undefined));
      return;
    }
    const unsubscribes: (() => void)[] = [];
    const check = () => {
      if (settled()) {
        unsubscribes.forEach(unsubscribe => {
          unsubscribe();
        });
        resume(Effect.succeed(undefined));
      }
    };
    unsubscribes.push(registry.subscribe(virtualBindAtom, check), registry.subscribe(virtualMaterializingAtom, check));
    return Effect.sync(() => {
      unsubscribes.forEach(unsubscribe => {
        unsubscribe();
      });
    });
  });

/**
 * The Bound session was opened with the MCP servers of an earlier setting: release it and Bind a fresh one, keeping the
 * blob (draft, cwd, Config). Waits for an in-flight Bind / Materialize first (its `session/new` may carry the old
 * servers), then no-op while unbound; inert under the Lifecycle lock.
 */
export const rebindVirtual = Effect.fn('rebindVirtual')(function* (registry: Registry) {
  yield* awaitVirtualSettled(registry);
  if (registry.get(virtualSessionAtom)?.sessionId === undefined) {
    return;
  }
  yield* mutateThenRebind(registry, {
    mutate: () => {
      const virtual = registry.get(virtualSessionAtom);
      if (virtual !== null) {
        setBlob(registry, { ...virtual, sessionId: undefined });
      }
    },
  });
});

/** Workspace folder gone: drop the blob regardless of content (background Bound teardown) and clear Selected. */
export const discardVirtual = Effect.fn('discardVirtual')(function* (registry: Registry) {
  yield* mutateThenRebind(registry, {
    mutate: () => {
      discardBlob(registry);
      registry.set(selectedAtom, undefined);
    },
    rebind: false,
  });
});

// Provider hooks + Selected hygiene

/** Provider became `usable`: request and await the newest Bind when the blob is on `launchTarget`. */
export const bindVirtualOnUsable = Effect.fn('bindVirtualOnUsable')(function* (
  registry: Registry,
  launchTarget: AgentLaunchTarget,
) {
  if (registry.get(virtualSessionAtom)?.launchTarget !== launchTarget) {
    return;
  }
  yield* requestBind(registry);
  yield* awaitCurrentBind(registry);
});

/**
 * The Provider was restarted (it dropped the draft's launch target and Config): put them back and Bind a fresh session,
 * unless the draft changed meanwhile (another draft, or a launch target chosen since).
 */
export const restoreVirtualAfterProviderRestart = Effect.fn('restoreVirtualAfterProviderRestart')(function* (
  registry: Registry,
  saved: Pick<VirtualSession, 'configValues' | 'id' | 'launchTarget'>,
) {
  const virtual = registry.get(virtualSessionAtom);
  if (
    virtual === null ||
    virtual.id !== saved.id ||
    virtual.launchTarget !== undefined ||
    saved.launchTarget === undefined
  ) {
    return;
  }
  setBlob(registry, { ...virtual, configValues: saved.configValues, launchTarget: saved.launchTarget });
  yield* bindVirtualOnUsable(registry, saved.launchTarget);
});

/**
 * Connection lost: the Bound session died with the connection. Drop it from the snapshot and clear the Bound id; keep
 * draft, cwd, launch target and Config so the next `usable` Binds again. No RPC (nothing to reach). Inert under the
 * Lifecycle lock: Materialize owns the blob there and fails or finishes on its own.
 */
export const unbindVirtualOnConnectionLost = (registry: Registry, launchTarget: AgentLaunchTarget): void => {
  if (registry.get(virtualMaterializingAtom)) {
    return;
  }
  // Supersede an in-flight Bind: its `session/new` may land after the loss with a dead id; it now tears that down.
  const bind = registry.get(virtualBindAtom);
  if (bind.current?.launchTarget === launchTarget) {
    registry.set(virtualBindAtom, { current: undefined, latest: bind.latest + 1 });
  }
  const virtual = registry.get(virtualSessionAtom);
  if (virtual?.launchTarget !== launchTarget || virtual.sessionId === undefined) {
    return;
  }
  const { sessionId } = virtual;
  updateHarnessSnapshot(registry, launchTarget, current => dropSession(current, sessionId));
  setBlob(registry, { ...virtual, sessionId: undefined });
};

/** Provider stopped: the Virtual target is gone with the process; unbind and drop the target and its Config. */
export const resetVirtualOnProviderStopped = (registry: Registry, launchTarget: AgentLaunchTarget): void => {
  const virtual = registry.get(virtualSessionAtom);
  if (virtual?.launchTarget === launchTarget) {
    setBlob(registry, { ...virtual, configValues: {}, launchTarget: undefined, sessionId: undefined });
  }
};

/** Config option index published: reset Virtual values the index no longer offers. */
export const resetVirtualUnsupportedConfig = (
  registry: Registry,
  launchTarget: AgentLaunchTarget,
  index: ConfigOptionIndex,
): void => {
  const virtual = registry.get(virtualSessionAtom);
  if (virtual?.launchTarget !== launchTarget) {
    return;
  }
  setBlob(registry, {
    ...virtual,
    configValues: resetUnsupportedConfigValues(
      index,
      virtual.configValues,
      registry.get(modelPickerPrefsAtom(launchTarget)),
    ),
  });
};

/** Clear a Selected Session that no longer exists on any provider (not while the Lifecycle lock is held). */
export const clearSelectedIfMissing = (registry: Registry): void => {
  const selected = registry.get(selectedAtom);
  if (selected?._tag !== 'Session' || registry.get(virtualMaterializingAtom)) {
    return;
  }
  const getSnapshot = (launchTarget: AgentLaunchTarget) => registry.get(backendHarnessSnapshotAtom(launchTarget));
  if (findLaunchTargetForSessionId(getSnapshot, selected.sessionId, registry.get(showArchivedAtom)) === undefined) {
    registry.set(selectedAtom, undefined);
  }
};

// AtomFns

/** Re-reads the Project's Workspace file (a directory or no Project is a no-op) so a new session sees its current folders. */
const refreshProjectOf = (registry: Registry, project: string | undefined) =>
  project === undefined ? Effect.void : refreshWorkspaceProject(registry, project);

export const createVirtualSessionAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const ensureVirtualSessionAtomFn = atomRuntime
    .fn((arg: EnsureVirtualSessionArg | undefined, get: Atom.FnContext) =>
      refreshProjectOf(get.registry, arg?.project).pipe(Effect.andThen(ensureVirtual(get.registry, arg))),
    )
    .pipe(Atom.keepAlive);

  const patchVirtualSessionAtomFn = atomRuntime
    .fn((edit: VirtualEdit, get: Atom.FnContext) => editVirtual(get.registry, edit))
    .pipe(Atom.keepAlive);

  const selectVirtualProjectAtomFn = atomRuntime
    .fn((project: string, get: Atom.FnContext) =>
      refreshProjectOf(get.registry, project).pipe(Effect.andThen(selectVirtualProject(get.registry, project))),
    )
    .pipe(Atom.keepAlive);

  const setVirtualLaunchTargetAtomFn = atomRuntime
    .fn((launchTarget: AgentLaunchTarget | undefined, get: Atom.FnContext) =>
      setVirtualLaunchTarget(get.registry, launchTarget),
    )
    .pipe(Atom.keepAlive);

  return {
    ensureVirtualSessionAtomFn,
    patchVirtualSessionAtomFn,
    selectVirtualProjectAtomFn,
    setVirtualLaunchTargetAtomFn,
  };
};
