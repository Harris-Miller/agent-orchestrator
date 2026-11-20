import { assert, describe, it } from '@effect/vitest';
import { Deferred, Duration, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { AtomRegistry } from 'effect/reactivity';

import { mockHostLayer } from './mockHostLayer.testing.ts';
import { attach, claimHandle, linkOf, reserveSlot } from './subagentLinkRegistry.ts';
import type { SpawnedHandleState, SubagentOutcome } from './subagentLinkRegistry.ts';
import type { SubagentResultStatus } from '../host/subagentResult.ts';
import { parseSubagentResults } from '../host/subagentResult.ts';
import { awaitOutcomeEntry, buildSubagentReport, startReporter, takeOutcomeAsToolResult } from './subagentOutcome.ts';

const child = { launchTarget: 'claude-agent-acp', sessionId: 'c1' } as const;

const setup = (handleState: SpawnedHandleState = 'open') => {
  const registry = AtomRegistry.make();
  const slot = reserveSlot(registry, { launchTarget: 'codex-acp', sessionId: 'p1' });
  if (slot === undefined) {
    throw new Error('no slot');
  }
  const link = slot.register({ child, description: 'd', task: 't' });
  if (handleState !== 'open') {
    claimHandle(registry, child, handleState);
  }
  const state = () => linkOf(registry, child)?.handleState;
  return { link, registry, state };
};

describe('buildSubagentReport', () => {
  const base = { description: 'Review diff', id: 'c1', task: 'Review the diff' };

  it('names the child and its task and carries the final message', () => {
    assert.strictEqual(
      buildSubagentReport({ ...base, outcome: { status: 'completed', text: 'All good.' } }),
      '<subagent-report id="c1" status="completed">\nsubagent: Review diff\ntask: Review the diff\n\nAll good.\n</subagent-report>',
    );
  });

  it('carries a failure or cancellation as its status and text', () => {
    assert.include(
      buildSubagentReport({ ...base, outcome: { status: 'failed', text: 'connection lost' } }),
      'status="failed">\nsubagent: Review diff\ntask: Review the diff\n\nconnection lost',
    );
    assert.include(buildSubagentReport({ ...base, outcome: { status: 'cancelled', text: 'x' } }), 'status="cancelled"');
  });

  it('reports a completed turn with no message as a failure', () => {
    const report = buildSubagentReport({ ...base, outcome: { status: 'completed', text: ' ' } });
    assert.include(report, 'status="failed"');
    assert.include(report, 'without producing a final message');
  });

  it('cuts a very long task', () => {
    const report = buildSubagentReport({
      ...base,
      outcome: { status: 'completed', text: 'ok' },
      task: 'x'.repeat(5000),
    });
    assert.isBelow(report.length, 1300);
    assert.include(report, '…');
  });
});

const meta = { childLaunchTarget: 'claude-agent-acp', childSessionId: 'c1', description: 'd', task: 't' } as const;

/** The one Subagent result in a tool result's text. */
const resultOf = (text: string) => {
  const [result] = parseSubagentResults(text);
  return result;
};

describe('takeOutcomeAsToolResult', () => {
  it('renders each outcome as a Subagent result and takes the hand-over', () => {
    const cases: [SubagentOutcome, boolean, SubagentResultStatus, string][] = [
      [{ status: 'completed', text: 'done' }, false, 'completed', 'done'],
      [{ status: 'cancelled', text: 'x' }, true, 'cancelled', 'x'],
      [{ status: 'failed', text: 'boom' }, true, 'failed', 'boom'],
      [{ status: 'completed', text: '  ' }, true, 'failed', 'The subagent finished without producing a final message.'],
    ];
    for (const [outcome, isError, status, body] of cases) {
      const { registry, state } = setup();
      const result = takeOutcomeAsToolResult(registry, meta, outcome);
      assert.strictEqual(result.isError, isError);
      assert.deepStrictEqual(resultOf(result.text), {
        body,
        config: {},
        description: 'd',
        id: 'c1',
        launchTarget: 'claude-agent-acp',
        status,
        task: 't',
      });
      assert.strictEqual(state(), 'waited');
    }
  });

  it('still answers after a report went out, leaving it reported', () => {
    const { registry, state } = setup('reported');
    const result = takeOutcomeAsToolResult(registry, meta, { status: 'completed', text: 'ok' });
    assert.strictEqual(resultOf(result.text).body, 'ok');
    assert.strictEqual(state(), 'reported');
  });

  it('renders when the link is gone', () => {
    const registry = AtomRegistry.make();
    const result = takeOutcomeAsToolResult(registry, meta, { status: 'completed', text: 'ok' });
    assert.strictEqual(resultOf(result.text).body, 'ok');
  });

  it('cuts a very long task', () => {
    const result = takeOutcomeAsToolResult(
      AtomRegistry.make(),
      { ...meta, task: 'x'.repeat(5000) },
      { status: 'completed', text: 'ok' },
    );
    assert.isBelow(result.text.length, 1400);
    assert.include(resultOf(result.text).task, '…');
  });
});

describe('awaitOutcomeEntry', () => {
  it.effect('is running past the bound and leaves the hand-over open', () =>
    Effect.gen(function* () {
      const { link, registry, state } = setup();
      const fiber = yield* Effect.forkChild(awaitOutcomeEntry(registry, link, Duration.seconds(5)));
      yield* TestClock.adjust(Duration.seconds(5));
      const text = yield* Fiber.join(fiber);
      assert.isTrue(text.endsWith(' />'));
      assert.deepStrictEqual([resultOf(text).id, resultOf(text).status, resultOf(text).body], ['c1', 'running', '']);
      assert.strictEqual(state(), 'open');
    }),
  );

  it.effect('collects a completed outcome', () =>
    Effect.gen(function* () {
      const { link, registry, state } = setup();
      yield* Deferred.succeed(link.outcome, { status: 'completed', text: 'hi' } as const);
      const result = resultOf(yield* awaitOutcomeEntry(registry, link, Duration.seconds(5)));
      assert.deepStrictEqual([result.status, result.body], ['completed', 'hi']);
      assert.strictEqual(state(), 'waited');
    }),
  );

  it.effect('reads a blank completed turn as failed, and answers after a report', () =>
    Effect.gen(function* () {
      const { link, registry, state } = setup('reported');
      yield* Deferred.succeed(link.outcome, { status: 'completed', text: '' } as const);
      const entry = yield* awaitOutcomeEntry(registry, link, Duration.seconds(5));
      assert.include(entry, 'status="failed"');
      assert.include(entry, 'without producing a final message');
      assert.strictEqual(state(), 'reported');
    }),
  );
});

describe('startReporter', () => {
  it.effect('is a no-op for an unknown child', () =>
    Effect.gen(function* () {
      yield* startReporter(AtomRegistry.make(), child);
    }).pipe(Effect.provide(mockHostLayer)),
  );

  it.effect('does not replace an existing reporter', () =>
    Effect.gen(function* () {
      const { registry } = setup();
      const first = yield* Effect.forkChild(Effect.never);
      attach(registry, child, { reporter: first });
      yield* startReporter(registry, child);
      assert.strictEqual(linkOf(registry, child)?.reporter, first);
    }).pipe(Effect.provide(mockHostLayer)),
  );
});
