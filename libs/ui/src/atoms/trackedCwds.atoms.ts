/** Tracked cwds: one hoa-home list for all launch targets, hydrated by HarnessCacheGate, grown from visible Session History. */
import { trackCwds, untrackCwd } from '@lib/hoa-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { cwdsToTrack } from '../host/cwdsToTrack.ts';

import { visibleSessionHistoryAtom } from './backendState.atoms.ts';

export const trackedCwdsAtom = Atom.make<readonly string[]>([]).pipe(Atom.withLabel('trackedCwds'), Atom.keepAlive);

/** True once the file was read. Stays false when it is malformed, so tracking and Untrack never overwrite it. */
export const trackedCwdsLoadedAtom = Atom.make(false).pipe(Atom.withLabel('trackedCwdsLoaded'), Atom.keepAlive);

/** Tracks the cwds of visible Session History rows not tracked yet. No-op until loaded; failures only warn. */
export const reconcileTrackedCwds = Effect.fn('reconcileTrackedCwds')(
  function* (registry: AtomRegistry.AtomRegistry) {
    if (!registry.get(trackedCwdsLoadedAtom)) {
      return;
    }
    const added = cwdsToTrack(registry.get(visibleSessionHistoryAtom), registry.get(trackedCwdsAtom));
    if (added.length === 0) {
      return;
    }
    const document = yield* trackCwds(added);
    registry.set(trackedCwdsAtom, document.cwds);
  },
  Effect.catchCause(cause => Effect.logWarning('track cwds failed', cause)),
);

export const createTrackedCwdsAtoms = ({ atomRuntime }: Pick<HostRuntimeBag, 'atomRuntime'>) => {
  const untrackCwdAtomFn = atomRuntime
    .fn(
      Effect.fn('untrackCwdAtomFn')(function* (cwd: string, get: Atom.FnContext) {
        if (!get(trackedCwdsLoadedAtom)) {
          return;
        }
        const document = yield* untrackCwd(cwd);
        get.set(trackedCwdsAtom, document.cwds);
      }),
    )
    .pipe(Atom.keepAlive);

  return { untrackCwdAtomFn };
};
