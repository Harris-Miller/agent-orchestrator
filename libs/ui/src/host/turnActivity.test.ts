import { assert, describe, it } from '@effect/vitest';

import { elicitation, harness, permission, session, subagent } from './harnessSnapshot.testing.ts';
import { anyPromptTurnWorking } from './turnActivity.ts';

describe('anyPromptTurnWorking', () => {
  it('is idle with no Backend harnesses or Sessions', () => {
    assert.isFalse(anyPromptTurnWorking([]));
    assert.isFalse(anyPromptTurnWorking([harness([session('a')])]));
  });

  it('is working while a Session has a Prompt turn in flight', () => {
    assert.isTrue(anyPromptTurnWorking([harness([session('a', { pendingClientRequest: 'prompt' })])]));
  });

  it('ignores Config changes', () => {
    assert.isFalse(anyPromptTurnWorking([harness([session('a', { pendingClientRequest: 'config' })])]));
  });

  it('counts Prompt turns across Sessions and launch targets', () => {
    assert.isTrue(
      anyPromptTurnWorking([
        harness([session('a')]),
        harness([session('b'), session('c', { pendingClientRequest: 'prompt' })]),
      ]),
    );
  });

  it('is not working while the turn waits on a Pending permission', () => {
    assert.isFalse(
      anyPromptTurnWorking([
        harness([session('a', { pendingClientRequest: 'prompt', pendingPermission: permission('a') })]),
      ]),
    );
  });

  it('is not working while the turn waits on a Pending elicitation', () => {
    assert.isFalse(
      anyPromptTurnWorking([
        harness([session('a', { pendingClientRequest: 'prompt', pendingElicitation: elicitation('a') })]),
      ]),
    );
  });

  it('is not working while a (nested) Subagent session waits on a Pending interaction', () => {
    assert.isFalse(
      anyPromptTurnWorking([
        harness(
          [session('a', { pendingClientRequest: 'prompt' })],
          [subagent('child', 'a'), subagent('grandchild', 'child', { pendingPermission: permission('grandchild') })],
        ),
      ]),
    );
  });

  it('is working when one turn is blocked and another runs', () => {
    assert.isTrue(
      anyPromptTurnWorking([
        harness(
          [session('a', { pendingClientRequest: 'prompt' }), session('b', { pendingClientRequest: 'prompt' })],
          [subagent('child', 'a', { pendingElicitation: elicitation('child') })],
        ),
      ]),
    );
  });

  it('is working during a Background follow-up: no turn, a Subagent still running', () => {
    assert.isTrue(
      anyPromptTurnWorking([harness([session('a')], [subagent('child', 'a', { state: { state: 'running' } })])]),
    );
  });

  it('is idle once the Subagents finished', () => {
    assert.isFalse(
      anyPromptTurnWorking([harness([session('a')], [subagent('child', 'a', { state: { state: 'completed' } })])]),
    );
  });

  it('is not working while a Background follow-up waits on a Pending interaction', () => {
    const running = { state: { state: 'running' } } as const;
    assert.isFalse(
      anyPromptTurnWorking([
        harness([session('a', { pendingPermission: permission('a') })], [subagent('child', 'a', running)]),
      ]),
    );
    assert.isFalse(
      anyPromptTurnWorking([
        harness([session('a')], [subagent('child', 'a', { ...running, pendingPermission: permission('child') })]),
      ]),
    );
  });
});
