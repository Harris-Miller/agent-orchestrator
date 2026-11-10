/**
 * Single writer of the Backend harness snapshot. The read model is exported read-only; every change is a
 * transition applied atomically to the latest value. Transitions must be pure and use their argument — never a
 * snapshot captured earlier (that would overwrite whatever landed in between).
 */
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import { initialBackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';

const writableHarnessSnapshotAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make(initialBackendHarnessSnapshot()).pipe(Atom.withLabel(`harnessSnapshot:${launchTarget}`), Atom.keepAlive),
);

/** Backend harness snapshot for one launch target (read-only; write via {@link updateHarnessSnapshot}). */
export const backendHarnessSnapshotAtom: (launchTarget: AgentLaunchTarget) => Atom.Atom<BackendHarnessSnapshot> =
  writableHarnessSnapshotAtom;

/** One launch target's Session History; notifies only when the history itself is replaced, not on other snapshot changes. */
export const sessionHistoryAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make(get => get(backendHarnessSnapshotAtom(launchTarget)).sessionHistory),
);

/** Apply `transition` to the latest snapshot. An identity transition notifies nobody. */
export const updateHarnessSnapshot = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  transition: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot,
): void => {
  registry.update(writableHarnessSnapshotAtom(launchTarget), transition);
};

/** Like {@link updateHarnessSnapshot}, also returning a value computed from the same read. */
export const modifyHarnessSnapshot = <A>(
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  f: (current: BackendHarnessSnapshot) => [result: A, next: BackendHarnessSnapshot],
): A => registry.modify(writableHarnessSnapshotAtom(launchTarget), f);
