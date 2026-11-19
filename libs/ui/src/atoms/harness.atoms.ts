/** ACP backend harness lifecycle Atoms (mount + restart). */
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { reconcileConnectionLost } from '../host/harnessStateTransitions.ts';
import { makeBackendLifecycle } from '../host/backendLifecycle.ts';
import { listCwdsForScope } from '../host/sessionListScope.ts';
import { requestAntigravitySignIn, runBackendHarness } from '../host/backendHarness.ts';

import { backendDesiredStateAtom } from './backendState.atoms.ts';
import type { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { clearRpcWireLog } from './rpcWireLog.ts';
import { projectsAtom } from './projects.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { resetVirtualOnProviderStopped } from './virtualSession.atoms.ts';

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
        runBackendHarness(launchTarget, fold, () =>
          listCwdsForScope(registry.get(sessionListScopeAtom), registry.get(projectsAtom)),
        ),
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
  const stopAndReconcile = Effect.fnUntraced(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
    yield* lifecycle.stop(launchTarget);
    updateHarnessSnapshot(get.registry, launchTarget, reconcileConnectionLost);
    clearRpcWireLog(get.registry, launchTarget);
    resetVirtualOnProviderStopped(get.registry, launchTarget);
  });

  const startBackend = (launchTarget: AgentLaunchTarget, get: Atom.FnContext): void => {
    get.set(backendDesiredStateAtom(launchTarget), 'running');
    get.refresh(backendHarnessAtom(launchTarget));
  };

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
    signInAntigravityAtomFn,
    startBackend,
    startBackendAtomFn,
    stopAndReconcile,
    stopBackendAtomFn,
  };
};
