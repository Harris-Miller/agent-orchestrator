/** Pure session-transcript writers: reduce session/update + append local user prompts. */

import type { SessionSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { SessionTranscript } from '../acp/sessionUpdateReducer.ts';
import { appendUserChatMessage, emptySessionTranscript, reduceSessionUpdate } from '../acp/sessionUpdateReducer.ts';
import { isRecord } from '../utils.ts';

export type SessionUpdateFoldResult =
  | { readonly kind: 'noop' }
  | {
      readonly kind: 'patch';
      readonly sessionInfoTitle?: string;
      readonly shouldSyncConfig: boolean;
      readonly transcript: SessionTranscript;
      readonly transcriptChanged: boolean;
    };

/** Append a local user prompt to the session transcript; other snapshot fields unchanged. */
export const withUserChatMessage = (session: SessionSnapshot, text: string): SessionSnapshot => ({
  ...session,
  transcript: appendUserChatMessage(session.transcript, text),
});

/**
 * Fold a raw session/update against the current session transcript.
 * Returns `noop` when the transcript is unchanged and no config/title side effects apply.
 */
export const foldSessionUpdate = (session: SessionSnapshot | undefined, update: unknown): SessionUpdateFoldResult => {
  const prev = session?.transcript ?? emptySessionTranscript();
  const next = reduceSessionUpdate(prev, update);
  const transcriptChanged = next !== prev;

  const skipConfigSync = session?.status === 'activating';
  const shouldSyncConfig =
    !skipConfigSync &&
    isRecord(update) &&
    update.sessionUpdate === 'config_option_update' &&
    Array.isArray(update.configOptions);

  const sessionInfoTitle =
    isRecord(update) && update.sessionUpdate === 'session_info_update' && typeof update.title === 'string'
      ? update.title
      : undefined;

  if (!transcriptChanged && !shouldSyncConfig && sessionInfoTitle === undefined) {
    return { kind: 'noop' };
  }

  return {
    kind: 'patch',
    sessionInfoTitle,
    shouldSyncConfig,
    transcript: next,
    transcriptChanged,
  };
};
