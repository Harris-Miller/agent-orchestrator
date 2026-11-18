import { assert, describe, it } from '@effect/vitest';
import { Deferred, Duration, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { AtomRegistry } from 'effect/reactivity';

import { addLink, linkOfChild } from '../host/subagentLinks.ts';
import type { SpawnedHandleState, SpawnedLink, SubagentOutcome } from '../host/subagentLinks.ts';

import { mockHostLayer } from './mockHostLayer.testing.ts';
import { spawnedLinksAtom } from './subagentLinks.atoms.ts';
import { awaitOutcomeEntry, buildSubagentReport, startReporter, takeOutcomeAsToolResult } from './subagentOutcome.ts';

const child = { launchTarget: 'claude-agent-acp', sessionId: 'c1' } as const;

const setup = (handleState: SpawnedHandleState = 'open') => {
  const registry = AtomRegistry.make();
  const link: SpawnedLink = {
    childLaunchTarget: 'claude-agent-acp',
    childSessionId: 'c1',
    description: 'd',
    handleState,
    outcome: Deferred.makeUnsafe<SubagentOutcome>(),
    parentLaunchTarget: 'codex-acp',
    parentSessionId: 'p1',
    task: 't',
  };
  registry.update(spawnedLinksAtom, links => addLink(links, link));
  const state = () => linkOfChild(registry.get(spawnedLinksAtom), 'claude-agent-acp', 'c1')?.handleState;
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

describe('takeOutcomeAsToolResult', () => {
  it('renders each outcome and takes the hand-over', () => {
    const cases: [SubagentOutcome, unknown][] = [
      [
        { status: 'completed', text: 'done' },
        { isError: false, text: 'done' },
      ],
      [
        { status: 'cancelled', text: 'x' },
        { isError: true, text: 'The subagent was cancelled.' },
      ],
      [
        { status: 'failed', text: 'boom' },
        { isError: true, text: 'The subagent failed: boom' },
      ],
      [
        { status: 'completed', text: '  ' },
        { isError: true, text: 'The subagent finished without producing a final message.' },
      ],
    ];
    for (const [outcome, expected] of cases) {
      const { registry, state } = setup();
      assert.deepStrictEqual(takeOutcomeAsToolResult(registry, child, outcome), expected);
      assert.strictEqual(state(), 'waited');
    }
  });

  it('still answers after a report went out, leaving it reported', () => {
    const { registry, state } = setup('reported');
    assert.deepStrictEqual(takeOutcomeAsToolResult(registry, child, { status: 'completed', text: 'ok' }), {
      isError: false,
      text: 'ok',
    });
    assert.strictEqual(state(), 'reported');
  });

  it('renders when the link is gone', () => {
    const registry = AtomRegistry.make();
    assert.deepStrictEqual(takeOutcomeAsToolResult(registry, child, { status: 'completed', text: 'ok' }), {
      isError: false,
      text: 'ok',
    });
  });
});

describe('awaitOutcomeEntry', () => {
  it.effect('is running past the bound and leaves the hand-over open', () =>
    Effect.gen(function* () {
      const { link, registry, state } = setup();
      const fiber = yield* Effect.forkChild(awaitOutcomeEntry(registry, link, Duration.seconds(5)));
      yield* TestClock.adjust(Duration.seconds(5));
      assert.strictEqual(yield* Fiber.join(fiber), '<subagent id="c1" status="running" />');
      assert.strictEqual(state(), 'open');
    }),
  );

  it.effect('collects a completed outcome', () =>
    Effect.gen(function* () {
      const { link, registry, state } = setup();
      yield* Deferred.succeed(link.outcome, { status: 'completed', text: 'hi' } as const);
      assert.strictEqual(
        yield* awaitOutcomeEntry(registry, link, Duration.seconds(5)),
        '<subagent id="c1" status="completed">\nhi\n</subagent>',
      );
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
      registry.update(spawnedLinksAtom, links => {
        const existing = linkOfChild(links, 'claude-agent-acp', 'c1');
        return existing === undefined ? links : addLink(links, { ...existing, reporter: first });
      });
      yield* startReporter(registry, child);
      assert.strictEqual(linkOfChild(registry.get(spawnedLinksAtom), 'claude-agent-acp', 'c1')?.reporter, first);
    }).pipe(Effect.provide(mockHostLayer)),
  );
});
