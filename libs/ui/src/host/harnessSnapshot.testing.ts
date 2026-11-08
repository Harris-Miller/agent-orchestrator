/** Backend harness snapshot builders shared by Turn activity and Keep-awake tests. */
import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import type { PendingElicitation, PendingPermission } from './pendingInteractions.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';
import type { SubagentSnapshot } from './subagent.ts';

export const permission = (sessionId: string) => ({ sessionId }) as unknown as PendingPermission;
export const elicitation = (sessionId: string) => ({ sessionId }) as unknown as PendingElicitation;

export const session = (sessionId: string, patch: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...initialSessionSnapshot(sessionId, 'active'),
  ...patch,
});

export const subagent = (
  sessionId: string,
  parentSessionId: string,
  patch: Partial<SubagentSnapshot> = {},
): SubagentSnapshot => ({
  parentSessionId,
  sessionId,
  transcript: emptySessionTranscript(),
  ...patch,
});

export const harness = (
  sessions: readonly SessionSnapshot[],
  subagents: readonly SubagentSnapshot[] = [],
): BackendHarnessSnapshot => ({
  ...initialBackendHarnessSnapshot(),
  phase: 'ready',
  sessions: Object.fromEntries(sessions.map(entry => [entry.sessionId, entry])),
  subagents: Object.fromEntries(subagents.map(entry => [entry.sessionId, entry])),
});
