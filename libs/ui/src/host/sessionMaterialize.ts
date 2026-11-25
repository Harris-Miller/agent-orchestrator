/** Session activation helpers: History entry from `session/new`, activated session snapshot. */

import { normalizeSessionInfoFromNew } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo, SessionConfiguration, SessionSnapshot } from './acpSessionBootstrap.ts';
import { normalizeSessionDirectories } from './sessionDirectories.ts';
import type { SessionDirectories } from './sessionDirectories.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';

/** Fields carried forward across activation merges (create may pass only `{ cwd }`). */
export type SessionActivationCarry = Partial<
  Pick<
    SessionSnapshot,
    'additionalDirectories' | 'availableCommands' | 'cwd' | 'transcript' | 'usage' | 'workspaceFile'
  >
>;

/** History entry from a successful `session/new` result (handoff early upsert). */
export const historyEntryFromNew = (
  result: unknown,
  cwd: string,
  directories?: SessionDirectories,
): NormalizedSessionInfo | undefined => normalizeSessionInfoFromNew(result, cwd, directories);

/** Build an active session snapshot with its Session configuration (+ optional carry fields). */
export const buildActivatedSession = (
  sessionId: string,
  configuration: SessionConfiguration,
  existing?: SessionActivationCarry,
): SessionSnapshot => ({
  ...normalizeSessionDirectories(existing),
  availableCommands: existing?.availableCommands,
  configuration,
  cwd: existing?.cwd,
  sessionId,
  status: 'active',
  transcript: existing?.transcript ?? emptySessionTranscript(),
  usage: existing?.usage,
});
