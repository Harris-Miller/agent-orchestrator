/** ACP backend harness lifecycle Atoms (mount + restart). */
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { cancelPendingRequests, reconcileStoppedProvider } from '../host/harnessStateTransitions.ts';
import { makeBackendLifecycle } from '../host/backendLifecycle.ts';
import { requestAntigravitySignIn, resetBackendHarnessState, runBackendHarness } from '../host/backendHarness.ts';
import { setConfigIndexSink } from '../host/sessionRpc.ts';

import {
  backendDesiredStateAtom,
  backendHarnessSnapshotAtom,
  clearSelectedSessionIfMissing,
} from './backendState.atoms.ts';
import { makeHarnessEventFold } from './harnessEventFold.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import type { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { refreshFsListingViaRegistry } from './virtualBind.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

type RefreshSessionFsListingAtomFn = ReturnType<typeof createSessionFsListingAtoms>['refreshSessionFsListingAtomFn'];

export const createHarnessAtoms = (
  runtime: HostRuntimeBag,
  refreshSessionFsListingAtomFn: RefreshSessionFsListingAtomFn,
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
        refreshFsListing: refreshFsListingViaRegistry(registry, refreshSessionFsListingAtomFn),
        registry,
        runFork: effect => {
          hostRunFork(effect);
        },
      });
      setConfigIndexSink(launchTarget, fold.onConfigIndexEvent);
      lifecycle.start(
        launchTarget,
        runBackendHarness(launchTarget, fold, () => registry.get(sessionListScopeAtom)),
      );
    }).pipe(Atom.keepAlive),
  );

  /**
   * Stop the provider and reconcile local state: await process exit, cancel pending requests, mark sessions
   * inactive (history and transcripts preserved), clear invalid selection / Virtual binding. Sessions are not
   * reopened automatically.
   */
  const stopAndReconcile = Effect.fnUntraced(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
    yield* lifecycle.stop(launchTarget);
    resetBackendHarnessState(launchTarget);
    cancelPendingRequests(get.registry.get(backendHarnessSnapshotAtom(launchTarget)));
    updateHarnessSnapshot(get.registry, launchTarget, reconcileStoppedProvider);
    const virtual = get.registry.get(virtualSessionAtom);
    if (virtual?.launchTarget === launchTarget) {
      // The Virtual target is gone with the process: unbind and drop the target so the composer cannot send to it.
      get.set(virtualSessionAtom, { ...virtual, configValues: {}, launchTarget: undefined, sessionId: undefined });
    }
    clearSelectedSessionIfMissing(get);
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
