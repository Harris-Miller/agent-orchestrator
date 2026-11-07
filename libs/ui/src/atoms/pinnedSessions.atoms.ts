/** Pinned sessions: per-launch-target pins (ao-home), hydrated by HarnessCacheGate, swept after successful lists. */
import { pinSession, unpinSessions } from '@lib/ao-home';
import type { PinnedSession } from '@lib/ao-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { compareHistoryEntries } from '../host/acpSessionBootstrap.ts';
import type { UnifiedHistoryEntry } from '../host/acpSessionBootstrap.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { pinsToUnpinAfterList } from '../host/pinnedSessions.ts';
import type { SessionListScope } from '../host/sessionListScope.ts';

import { visibleSessionHistoryAtom } from './backendState.atoms.ts';

export const pinnedSessionsAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make<readonly PinnedSession[]>([]).pipe(Atom.withLabel(`pinnedSessions:${launchTarget}`), Atom.keepAlive),
);

/** True once this target's pin file was read. Stays false when it is malformed, so Pin/Unpin never overwrite it. */
export const pinsLoadedAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make(false).pipe(Atom.withLabel(`pinsLoaded:${launchTarget}`), Atom.keepAlive),
);

/** Visible pinned rows across launch targets, in Session History order. Hidden archived pins stay stored. */
export const pinnedEntriesAtom = Atom.make(get => {
  const pinnedIds = new Map(
    MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => [
      launchTarget,
      new Set(get(pinnedSessionsAtom(launchTarget)).map(pin => pin.sessionId)),
    ]),
  );
  return get(visibleSessionHistoryAtom)
    .filter((entry: UnifiedHistoryEntry) => pinnedIds.get(entry.launchTarget)?.has(entry.sessionId) === true)
    .sort(compareHistoryEntries);
}).pipe(Atom.keepAlive);

/** Drops pins from disk and state. No-op until pins are loaded; failures only warn. */
export const removePins = Effect.fn('removePins')(
  function* (registry: AtomRegistry.AtomRegistry, launchTarget: AgentLaunchTarget, sessionIds: readonly string[]) {
    if (sessionIds.length === 0 || !registry.get(pinsLoadedAtom(launchTarget))) {
      return;
    }
    const document = yield* unpinSessions(toLaunchTarget(launchTarget), sessionIds);
    registry.set(pinnedSessionsAtom(launchTarget), document.pinned);
  },
  Effect.catchCause(cause => Effect.logWarning('unpin sessions failed', cause)),
);

/**
 * Shared "after successful list" step for every list path. `pinsBeforeRequest` must be read before the request is
 * sent so pins made while it was in flight (session/new races) are never swept.
 */
export const reconcilePinsAfterList = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  pinsBeforeRequest: readonly PinnedSession[],
  listResult: unknown,
  scope: SessionListScope,
) => removePins(registry, launchTarget, pinsToUnpinAfterList(pinsBeforeRequest, listResult, scope));

export type PinTarget = {
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
};

export const createPinnedSessionsAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  const pinSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('pinSessionAtomFn')(function* (arg: PinTarget & { cwd: string }, get: Atom.FnContext) {
        if (!get(pinsLoadedAtom(arg.launchTarget))) {
          return;
        }
        const document = yield* pinSession(toLaunchTarget(arg.launchTarget), {
          cwd: arg.cwd,
          sessionId: arg.sessionId,
        });
        get.set(pinnedSessionsAtom(arg.launchTarget), document.pinned);
      }),
    )
    .pipe(Atom.keepAlive);

  const unpinSessionAtomFn = atomRuntime
    .fn(
      Effect.fn('unpinSessionAtomFn')(function* (arg: PinTarget, get: Atom.FnContext) {
        if (!get(pinsLoadedAtom(arg.launchTarget))) {
          return;
        }
        const document = yield* unpinSessions(toLaunchTarget(arg.launchTarget), [arg.sessionId]);
        get.set(pinnedSessionsAtom(arg.launchTarget), document.pinned);
      }),
    )
    .pipe(Atom.keepAlive);

  return { pinSessionAtomFn, unpinSessionAtomFn };
};
