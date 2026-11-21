/**
 * Single writer of the Backend harness snapshot. The read model is exported read-only; every change is a
 * transition applied atomically to the latest value. Transitions must be pure and use their argument — never a
 * snapshot captured earlier (that would overwrite whatever landed in between). After each write, a Pending interaction
 * the transition removed unanswered is cancelled on the agent: transitions only drop them, this is the one place they settle.
 */
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import { initialBackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { cancelDroppedPendingInteractions } from '../host/pendingInteractions.ts';

const writableHarnessSnapshotAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make(initialBackendHarnessSnapshot()).pipe(Atom.withLabel(`harnessSnapshot:${launchTarget}`), Atom.keepAlive),
);

/** Backend harness snapshot for one launch target (read-only; write via {@link updateHarnessSnapshot}). */
export const backendHarnessSnapshotAtom: (launchTarget: AgentLaunchTarget) => Atom.Atom<BackendHarnessSnapshot> =
  writableHarnessSnapshotAtom;

const holdersOf = (snapshot: BackendHarnessSnapshot) => [
  ...Object.values(snapshot.sessions),
  ...Object.values(snapshot.subagents),
];

/** Like {@link updateHarnessSnapshot}, also returning a value computed from the same read. */
export const modifyHarnessSnapshot = <A>(
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  f: (current: BackendHarnessSnapshot) => [result: A, next: BackendHarnessSnapshot],
): A => {
  const [result, before, after] = registry.modify(writableHarnessSnapshotAtom(launchTarget), current => {
    const [value, next] = f(current);
    return [[value, current, next] as const, next];
  });
  if (before !== after) {
    cancelDroppedPendingInteractions(holdersOf(before), holdersOf(after));
  }
  return result;
};

/** Apply `transition` to the latest snapshot. An identity transition notifies nobody. */
export const updateHarnessSnapshot = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  transition: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot,
): void => {
  modifyHarnessSnapshot(registry, launchTarget, current => [undefined, transition(current)]);
};
