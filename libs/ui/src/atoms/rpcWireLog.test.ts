import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';

import type { RpcWireEntry } from '../host/backendHarness.ts';

import { backendHarnessSnapshotAtom } from './harnessSnapshot.ts';
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
      registry.get(rpcWireLogAtom(CODEX)).map(call => call.id),
      ['a', 'b'],
    );
    clearRpcWireLog(registry, CODEX);
    assert.deepStrictEqual(registry.get(rpcWireLogAtom(CODEX)), []);
    assert.strictEqual(registry.get(rpcWireLogAtom(CLAUDE)).length, 1);
  });

  it('never touches the Backend harness snapshot', () => {
    const registry = AtomRegistry.make();
    const before = registry.get(backendHarnessSnapshotAtom(CODEX));
    let snapshotNotifications = 0;
    registry.subscribe(backendHarnessSnapshotAtom(CODEX), () => {
      snapshotNotifications += 1;
    });
    appendRpcWireEntry(registry, CODEX, entry('a'));
    assert.strictEqual(snapshotNotifications, 0);
    assert.strictEqual(registry.get(backendHarnessSnapshotAtom(CODEX)), before);
  });
});
