/**
 * The RPC wire log: every ACP message sent or received for one launch target, for the Developer panel and the error
 * data a failed activation records. It lives outside the Backend harness snapshot so debug traffic never touches the
 * state the Harness decides from. Kept across Connection lost (a retry's messages follow the failed attempt's); a
 * provider stop (Stop, and the restarts built on it) clears it.
 */
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { RpcWireEntry } from '../host/backendHarness.ts';

const writableRpcWireLogAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  Atom.make<readonly RpcWireEntry[]>([]).pipe(Atom.withLabel(`rpcWireLog:${launchTarget}`), Atom.keepAlive),
);

/** The wire log for one launch target (read-only; write via {@link appendRpcWireEntry} / {@link clearRpcWireLog}). */
export const rpcWireLogAtom: (launchTarget: AgentLaunchTarget) => Atom.Atom<readonly RpcWireEntry[]> =
  writableRpcWireLogAtom;

/** Append one message; only subscribers of this launch target's wire log are notified. */
export const appendRpcWireEntry = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  entry: RpcWireEntry,
): void => {
  registry.update(writableRpcWireLogAtom(launchTarget), log => [...log, entry]);
};

/** Empty the log (Stop). */
export const clearRpcWireLog = (registry: AtomRegistry.AtomRegistry, launchTarget: AgentLaunchTarget): void => {
  registry.set(writableRpcWireLogAtom(launchTarget), []);
};
