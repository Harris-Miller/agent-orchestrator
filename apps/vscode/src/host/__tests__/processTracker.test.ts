import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { EventEmitter } from 'node:events';

import { ProcessTracker } from '../processTracker.ts';

class FakeChild extends EventEmitter {
  public killed = false;
  public readonly kill = (): boolean => {
    this.killed = true;
    return true;
  };
}

describe('ProcessTracker', () => {
  it('kills all children for a webview on killAllForWebview', () => {
    const tracker = new ProcessTracker();
    const a = new FakeChild() as unknown as import('node:child_process').ChildProcess;
    const b = new FakeChild() as unknown as import('node:child_process').ChildProcess;
    const ha = tracker.allocateHandleId();
    const hb = tracker.allocateHandleId();
    tracker.register('wv-1', ha, a);
    tracker.register('wv-1', hb, b);
    tracker.killAllForWebview('wv-1');
    assert.strictEqual((a as unknown as FakeChild).killed, true);
    assert.strictEqual((b as unknown as FakeChild).killed, true);
    assert.strictEqual(tracker.get('wv-1', ha), undefined);
  });

  it('killAll clears every webview', () => {
    const tracker = new ProcessTracker();
    const a = new FakeChild() as unknown as import('node:child_process').ChildProcess;
    tracker.register('wv-1', tracker.allocateHandleId(), a);
    tracker.killAll();
    assert.strictEqual((a as unknown as FakeChild).killed, true);
  });

  // Keep Effect style available for future Effect-based tracker tests.
  it.effect('allocateHandleId is unique', () =>
    Effect.sync(() => {
      const tracker = new ProcessTracker();
      assert.notStrictEqual(tracker.allocateHandleId(), tracker.allocateHandleId());
    }),
  );
});
