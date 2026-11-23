/**
 * Session lifecycle AtomFns: the React edge over the verbs in `sessionLifecycle.ts`. Each runs one verb under the
 * action's root span; the verbs log their own failures. Non-React callers use the verbs directly, never these AtomFns (a non-concurrent AtomFn
 * interrupts its previous run when set again).
 */
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import {
  projectTrackingStopped,
  sessionArchived,
  sessionDeleted,
  sessionForked,
  sessionRenamed,
  sessionUnarchived,
} from '../analytics/catalog.ts';
import { trackEvent } from '../analytics/trackEvent.ts';
import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { SessionTarget } from '../host/projectSessions.ts';

import { select } from './virtualSession.atoms.ts';
import {
  activateSession,
  archiveSession,
  archiveSessions,
  deactivateSession,
  deleteSession,
  forkSession,
  reactivateActiveSessions,
  renameSession,
  stopTrackingProject,
  unarchiveSession,
  unarchiveSessions,
} from './sessionLifecycle.ts';
import type { RestartBackend } from './sessionLifecycle.ts';

/** The action's root span (desktop ADR 0008), carrying the Session it acts on. */
const rootSpan = (name: string, target?: SessionTarget) =>
  Effect.withSpan(name, {
    attributes: target === undefined ? {} : { 'acp.agent': target.launchTarget, 'acp.sessionId': target.sessionId },
    root: true,
  });

export const createSessionLifecycleAtoms = (runtime: HostRuntimeBag, restartBackend: RestartBackend) => {
  const { atomRuntime } = runtime;

  const clearSelectedAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) => select(get.registry, undefined))
    .pipe(Atom.keepAlive);

  const activateSessionAtomFn = atomRuntime
    .fn((arg: SessionTarget & { readonly keepSelection?: true }, get: Atom.FnContext) =>
      activateSession(get.registry, arg).pipe(rootSpan('activateSessionAtomFn', arg)),
    )
    .pipe(Atom.keepAlive);

  const forkSessionAtomFn = atomRuntime
    .fn((arg: SessionTarget & { readonly cwd: string }, get: Atom.FnContext) =>
      forkSession(get.registry, arg).pipe(
        trackEvent(sessionForked(arg.launchTarget), Boolean),
        rootSpan('forkSessionAtomFn', arg),
      ),
    )
    .pipe(Atom.keepAlive);

  const deactivateSessionAtomFn = atomRuntime
    .fn((arg: SessionTarget, get: Atom.FnContext) =>
      deactivateSession(get.registry, arg).pipe(rootSpan('deactivateSessionAtomFn', arg)),
    )
    .pipe(Atom.keepAlive);

  /** Latest-wins on purpose: the hub re-runs it on every change (each launch target's group is uninterruptible). */
  const reactivateActiveSessionsAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) =>
      reactivateActiveSessions(get.registry, restartBackend).pipe(rootSpan('reactivateActiveSessionsAtomFn')),
    )
    .pipe(Atom.keepAlive);

  const stopTrackingProjectAtomFn = atomRuntime
    .fn((cwd: string, get: Atom.FnContext) =>
      stopTrackingProject(get.registry, cwd).pipe(
        trackEvent(projectTrackingStopped()),
        rootSpan('stopTrackingProjectAtomFn'),
      ),
    )
    .pipe(Atom.keepAlive);

  const archiveSessionAtomFn = atomRuntime
    .fn((arg: SessionTarget, get: Atom.FnContext) =>
      archiveSession(get.registry, arg).pipe(
        trackEvent(sessionArchived(arg.launchTarget)),
        rootSpan('archiveSessionAtomFn', arg),
      ),
    )
    .pipe(Atom.keepAlive);

  const unarchiveSessionAtomFn = atomRuntime
    .fn((arg: SessionTarget, get: Atom.FnContext) =>
      unarchiveSession(get.registry, arg).pipe(
        trackEvent(sessionUnarchived(arg.launchTarget)),
        rootSpan('unarchiveSessionAtomFn', arg),
      ),
    )
    .pipe(Atom.keepAlive);

  const archiveSessionsAtomFn = atomRuntime
    .fn((targets: readonly SessionTarget[], get: Atom.FnContext) =>
      archiveSessions(get.registry, targets).pipe(rootSpan('archiveSessionsAtomFn')),
    )
    .pipe(Atom.keepAlive);

  const unarchiveSessionsAtomFn = atomRuntime
    .fn((targets: readonly SessionTarget[], get: Atom.FnContext) =>
      unarchiveSessions(get.registry, targets).pipe(rootSpan('unarchiveSessionsAtomFn')),
    )
    .pipe(Atom.keepAlive);

  const renameSessionAtomFn = atomRuntime
    .fn((arg: SessionTarget & { readonly title: string }, get: Atom.FnContext) =>
      renameSession(get.registry, arg).pipe(
        trackEvent(sessionRenamed(arg.launchTarget), Boolean),
        rootSpan('renameSessionAtomFn', arg),
      ),
    )
    .pipe(Atom.keepAlive);

  const deleteSessionAtomFn = atomRuntime
    .fn(
      (arg: SessionTarget, get: Atom.FnContext) =>
        deleteSession(get.registry, arg).pipe(
          trackEvent(sessionDeleted(arg.launchTarget)),
          rootSpan('deleteSessionAtomFn', arg),
        ),
      // Callers do not await the RPC, so a later Delete must not interrupt an earlier one still in flight.
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  return {
    activateSessionAtomFn,
    archiveSessionAtomFn,
    archiveSessionsAtomFn,
    clearSelectedAtomFn,
    deactivateSessionAtomFn,
    deleteSessionAtomFn,
    forkSessionAtomFn,
    reactivateActiveSessionsAtomFn,
    renameSessionAtomFn,
    stopTrackingProjectAtomFn,
    unarchiveSessionAtomFn,
    unarchiveSessionsAtomFn,
  };
};
