import { assert, describe, it } from '@effect/vitest';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import type { SubagentSnapshot } from './subagent.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';
import { anyAgentWorking } from './turnActivity.ts';

const permission = (sessionId: string) => ({ sessionId }) as unknown as PendingPermission;
const elicitation = (sessionId: string) => ({ sessionId }) as unknown as PendingElicitation;

const session = (sessionId: string, patch: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...initialSessionSnapshot(sessionId, 'active'),
  ...patch,
});

const subagent = (sessionId: string, parentSessionId: string, patch: Partial<SubagentSnapshot> = {}) => ({
  parentSessionId,
  sessionId,
  transcript: emptySessionTranscript(),
  ...patch,
});

const harness = (
  sessions: readonly SessionSnapshot[],
  subagents: readonly SubagentSnapshot[] = [],
): BackendHarnessSnapshot => ({
  ...initialBackendHarnessSnapshot(),
  sessions: Object.fromEntries(sessions.map(entry => [entry.sessionId, entry])),
  subagents: Object.fromEntries(subagents.map(entry => [entry.sessionId, entry])),
});

describe('anyAgentWorking', () => {
  it('is idle with no Backend harnesses or Sessions', () => {
    assert.isFalse(anyAgentWorking([]));
    assert.isFalse(anyAgentWorking([harness([session('a')])]));
  });

  it('is working while a Session has a Prompt turn in flight', () => {
    assert.isTrue(anyAgentWorking([harness([session('a', { pendingClientRequest: 'prompt' })])]));
  });

  it('ignores Config changes', () => {
    assert.isFalse(anyAgentWorking([harness([session('a', { pendingClientRequest: 'config' })])]));
  });

  it('counts Prompt turns across Sessions and launch targets', () => {
    assert.isTrue(
      anyAgentWorking([
        harness([session('a')]),
        harness([session('b'), session('c', { pendingClientRequest: 'prompt' })]),
      ]),
    );
  });

  it('is not working while the turn waits on a Pending permission', () => {
    assert.isFalse(
      anyAgentWorking([
        harness([session('a', { pendingClientRequest: 'prompt', pendingPermission: permission('a') })]),
      ]),
    );
  });

  it('is not working while the turn waits on a Pending elicitation', () => {
    assert.isFalse(
      anyAgentWorking([
        harness([session('a', { pendingClientRequest: 'prompt', pendingElicitation: elicitation('a') })]),
      ]),
    );
  });

  it('is not working while a (nested) Subagent session waits on a Pending interaction', () => {
    assert.isFalse(
      anyAgentWorking([
        harness(
          [session('a', { pendingClientRequest: 'prompt' })],
          [subagent('child', 'a'), subagent('grandchild', 'child', { pendingPermission: permission('grandchild') })],
        ),
      ]),
    );
  });

  it('is working when one turn is blocked and another runs', () => {
    assert.isTrue(
      anyAgentWorking([
        harness(
          [session('a', { pendingClientRequest: 'prompt' }), session('b', { pendingClientRequest: 'prompt' })],
          [subagent('child', 'a', { pendingElicitation: elicitation('child') })],
        ),
      ]),
    );
  });
});
