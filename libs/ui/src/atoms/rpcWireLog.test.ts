import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';

import type { RpcWireEntry } from '../host/backendHarness.ts';

import { backendHarnessSnapshotAtom, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { appendRpcWireEntry, clearRpcWireLog, rpcWireLogAtom } from './rpcWireLog.ts';

const CODEX = 'codex-acp';
const CLAUDE = 'claude-agent-acp';
const entry = (id: string): RpcWireEntry => ({ direction: 'out', id, message: {}, receivedAt: 1 });

describe('rpcWireLogAtom', () => {
  it('appends in order per launch target and clears only that target', () => {
    const registry = AtomRegistry.make();
    appendRpcWireEntry(registry, CODEX, entry('a'));
    appendRpcWireEntry(registry, CODEX, entry('b'));
    appendRpcWireEntry(registry, CLAUDE, entry('c'));
    assert.deepStrictEqual(
      registry.get(rpcWireLogAtom(CODEX)).map(({ id }) => id),
      ['a', 'b'],
    );
    clearRpcWireLog(registry, CODEX);
    assert.deepStrictEqual(registry.get(rpcWireLogAtom(CODEX)), []);
    assert.strictEqual(registry.get(rpcWireLogAtom(CLAUDE)).length, 1);
    registry.dispose();
  });

  it('never touches the Backend harness snapshot', () => {
    const registry = AtomRegistry.make();
    let snapshotNotifications = 0;
    const unsubscribe = registry.subscribe(backendHarnessSnapshotAtom(CODEX), () => {
      snapshotNotifications += 1;
    });

    updateHarnessSnapshot(registry, CODEX, current => ({ ...current, phase: 'usable' }));
    assert.isAbove(snapshotNotifications, 0, 'a snapshot write notifies its subscriber');
    const written = registry.get(backendHarnessSnapshotAtom(CODEX));

    const notificationsBefore = snapshotNotifications;
    appendRpcWireEntry(registry, CODEX, entry('a'));
    clearRpcWireLog(registry, CODEX);
    assert.strictEqual(snapshotNotifications, notificationsBefore);
    assert.strictEqual(registry.get(backendHarnessSnapshotAtom(CODEX)), written);
    unsubscribe();
    registry.dispose();
  });
});
