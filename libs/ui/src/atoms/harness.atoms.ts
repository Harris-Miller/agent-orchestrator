/** ACP backend harness lifecycle Atoms (mount + restart). */
import type { HostServices } from '@lib/context-services';
import { Duration, Effect, Schema } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { ALL_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import { reconcileConnectionLost } from '../host/harnessStateTransitions.ts';
import { makeBackendLifecycle } from '../host/backendLifecycle.ts';
import { requestAntigravitySignIn, runBackendHarness } from '../host/backendHarness.ts';

import { isUsablePhase } from '../host/acpSessionBootstrap.ts';

import { backendDesiredStateAtom } from './backendState.atoms.ts';
import type { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { backendHarnessSnapshotAtom, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { clearRpcWireLog } from './rpcWireLog.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { resetVirtualOnProviderStopped } from './virtualSession.atoms.ts';

/** A Provider restart that did not reach `usable` again (stopped by the user, or timed out). */
export class BackendRestartFailed extends Schema.TaggedError<BackendRestartFailed>()('BackendRestartFailed', {
  launchTarget: Schema.Literals(ALL_AGENT_LAUNCH_TARGETS),
  reason: Schema.String,
}) {}

/** Generous: a cold Provider start (spawn, initialize, Config probe) can take a while. */
const RESTART_USABLE_TIMEOUT = Duration.minutes(2);

/**
 * Resolves once the target's snapshot phase is `usable`/`ready` (its connection is registered before initialize, so
 * session RPCs work); fails when the user stops the Provider meanwhile or the timeout elapses. Reads the registry only.
 */
export const awaitBackendUsable = (registry: AtomRegistry.AtomRegistry, launchTarget: AgentLaunchTarget) =>
  Effect.callback<undefined, BackendRestartFailed>(resume => {
    const fail = (reason: string) => {
      resume(Effect.fail(new BackendRestartFailed({ launchTarget, reason })));
    };
    const unsubscribes: (() => void)[] = [];
    const cleanup = () => {
      unsubscribes.forEach(unsubscribe => {
        unsubscribe();
      });
    };
    const check = () => {
      if (registry.get(backendDesiredStateAtom(launchTarget)) === 'stopped') {
        cleanup();
        fail('stopped while restarting');
      } else if (isUsablePhase(registry.get(backendHarnessSnapshotAtom(launchTarget)).phase)) {
        cleanup();
        resume(Effect.succeed(undefined));
      }
    };
    unsubscribes.push(
      registry.subscribe(backendHarnessSnapshotAtom(launchTarget), check),
      registry.subscribe(backendDesiredStateAtom(launchTarget), check),
    );
    check();
    return Effect.sync(cleanup);
  }).pipe(
    Effect.timeoutOrElse({
      duration: RESTART_USABLE_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new BackendRestartFailed({ launchTarget, reason: 'timed out waiting for the Provider to become usable' }),
        ),
    }),
  );

export const createHarnessAtoms = (
  runtime: HostRuntimeBag,
  {
    setModelPickerPrefsAtom,
  }: { readonly setModelPickerPrefsAtom: ReturnType<typeof createUserSettingsAtoms>['setModelPickerPrefsAtom'] },
) => {
  const { atomRuntime, hostRunFork } = runtime;

  /** Single owner of provider process lifetime: atoms never own it, so remount cannot duplicate a backend. */
  const lifecycle = makeBackendLifecycle<HostServices>(effect => hostRunFork(effect));

  const backendHarnessAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    Atom.make(get => {
      // Disabled / stopping providers never spawn from a remount or retry; only an explicit running + start does.
      if (get(backendDesiredStateAtom(launchTarget)) === 'stopped') {
        return;
      }
      const { registry } = get;
      const fold = makeHarnessEventFold({
        launchTarget,
        registry,
        runFork: effect => {
          hostRunFork(effect);
        },
        setModelPickerPrefs: prefs => {
          registry.set(setModelPickerPrefsAtom, { launchTarget, prefs });
        },
      });
      lifecycle.start(
        launchTarget,
        runBackendHarness(launchTarget, fold, () => registry.get(listedCwdsAtom)),
      );
    }).pipe(Atom.withLabel(`backendHarness:${launchTarget}`), Atom.keepAlive),
  );

  /**
   * Stop the provider and reconcile local state. `lifecycle.stop` awaits process exit; a live connection's release
   * runs Connection lost (pending requests cancelled, sessions inactive with history and transcripts preserved,
   * Virtual unbound). The reconcile is applied once more so a Stop with no live connection (retry sleep, retries
   * exhausted, launch-prerequisite failure) still clears a Bootstrap `error`; it is idempotent. Stop alone also clears
   * the RPC wire log (Connection lost keeps it across retries; Stop is its only bound) and drops the Virtual session's
   * launch target and Config. Sessions are not reopened automatically.
   */
  const stopAndReconcile = Effect.fnUntraced(function* (
    launchTarget: AgentLaunchTarget,
    get: { readonly registry: AtomRegistry.AtomRegistry },
  ) {
    yield* lifecycle.stop(launchTarget);
    updateHarnessSnapshot(get.registry, launchTarget, reconcileConnectionLost);
    clearRpcWireLog(get.registry, launchTarget);
    resetVirtualOnProviderStopped(get.registry, launchTarget);
  });

  const startBackend = (
    launchTarget: AgentLaunchTarget,
    get: { readonly registry: AtomRegistry.AtomRegistry },
  ): void => {
    get.registry.set(backendDesiredStateAtom(launchTarget), 'running');
    get.registry.refresh(backendHarnessAtom(launchTarget));
  };

  /**
   * Stop then start the Provider and wait until it is `usable` again (Connection lost keeps sessions, transcripts and cwd,
   * marks them inactive). Takes the registry, not a FnContext, so it survives its caller's re-invocation. Fails when
   * the user stopped the Provider (never started again here) or it does not come back in time.
   */
  const restartBackendAwaitingUsable = Effect.fnUntraced(function* (
    launchTarget: AgentLaunchTarget,
    registry: AtomRegistry.AtomRegistry,
  ) {
    yield* Effect.logWarning('Restarting ACP backend harness (awaiting usable)', launchTarget);
    yield* stopAndReconcile(launchTarget, { registry });
    if (registry.get(backendDesiredStateAtom(launchTarget)) === 'stopped') {
      return yield* new BackendRestartFailed({ launchTarget, reason: 'stopped by the user' });
    }
    startBackend(launchTarget, { registry });
    yield* awaitBackendUsable(registry, launchTarget);
  });

  /** Disable: block start, await actual exit, reconcile. No hidden process, retry or stale active snapshot. */
  const stopBackendAtomFn = atomRuntime
    .fn(
      Effect.fn('stopBackendAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        yield* Effect.logWarning('Stopping ACP backend harness', launchTarget);
        get.set(backendDesiredStateAtom(launchTarget), 'stopped');
        yield* stopAndReconcile(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Await stop, then start the backend once (re-reads `current.json` at spawn). */
  const restartBackendAtomFn = atomRuntime
    .fn(
      Effect.fn('restartBackendAtomFn', { root: true })(function* (
        launchTarget: AgentLaunchTarget,
        get: Atom.FnContext,
      ) {
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        yield* Effect.logWarning('Restarting ACP backend harness', launchTarget);
        yield* stopAndReconcile(launchTarget, get);
        startBackend(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  const signInAntigravityAtomFn = atomRuntime
    .fn(
      Effect.fn('signInAntigravityAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        const launchTarget = 'antigravity-acp' as const;
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        yield* Effect.logWarning('Antigravity Sign in requested');
        yield* stopAndReconcile(launchTarget, get);
        yield* requestAntigravitySignIn();
        startBackend(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Start a stopped (enabled) provider once; no-op when already running. */
  const startBackendAtomFn = atomRuntime
    .fn(
      Effect.fn('startBackendAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        startBackend(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    backendHarnessAtom,
    restartBackendAtomFn,
    restartBackendAwaitingUsable,
    signInAntigravityAtomFn,
    startBackend,
    startBackendAtomFn,
    stopAndReconcile,
    stopBackendAtomFn,
  };
};
