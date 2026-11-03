/** Session update apply: one inbound session/update → next snapshot (+ history title). */
import { isRecord } from '../isRecord.ts';

import { applySessionInfoTitle, applySetConfigOptionResult, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo, SessionSnapshot } from './acpSessionBootstrap.ts';
import {
  appendUserChatMessage,
  parseAvailableCommands,
  parseUsageUpdate,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';
import type { UserMessageImageRef } from './sessionUpdateReducer.ts';

export type ApplySessionUpdateResult =
  | { readonly kind: 'noop' }
  | {
      readonly kind: 'patch';
      readonly session: SessionSnapshot;
      readonly sessionHistory?: readonly NormalizedSessionInfo[];
      readonly usageChanged: boolean;
    };

/** Append a local user prompt to the session transcript; other snapshot fields unchanged. */
export const withUserChatMessage = (
  session: SessionSnapshot,
  text: string,
  images?: readonly UserMessageImageRef[],
  steering?: true,
): SessionSnapshot => ({
  ...session,
  transcript: appendUserChatMessage(session.transcript, text, images, steering),
});

/**
 * Fold one raw session/update into the next session snapshot (and history title when needed).
 * Seeds a missing session from `initialSessionSnapshot`. Pure — no disk, no atoms.
 */
export const applySessionUpdate = (
  session: SessionSnapshot | undefined,
  sessionId: string,
  history: readonly NormalizedSessionInfo[],
  update: unknown,
): ApplySessionUpdateResult => {
  const base = session ?? initialSessionSnapshot(sessionId);
  const nextTranscript = reduceSessionUpdate(base.transcript, update);
  const transcriptChanged = nextTranscript !== base.transcript;

  let next: SessionSnapshot = transcriptChanged ? { ...base, transcript: nextTranscript } : base;
  let sessionChanged = transcriptChanged;
  let usageChanged = false;
  let sessionHistory: readonly NormalizedSessionInfo[] | undefined;

  if (isRecord(update) && typeof update.sessionUpdate === 'string') {
    switch (update.sessionUpdate) {
      case 'available_commands_update': {
        const availableCommands = parseAvailableCommands(update.availableCommands);
        next = { ...next, availableCommands };
        sessionChanged = true;
        break;
      }
      case 'config_option_update': {
        if (Array.isArray(update.configOptions)) {
          const applied = applySetConfigOptionResult(next.sessionConfiguration, {
            configOptions: update.configOptions,
          });
          next = {
            ...next,
            selectedModeId: applied.selectedModeId ?? next.selectedModeId,
            selectedModelId: applied.selectedModelId ?? next.selectedModelId,
            sessionConfiguration: applied.sessionConfiguration,
          };
          sessionChanged = true;
        }
        break;
      }
      case 'session_info_update': {
        if (typeof update.title === 'string') {
          sessionHistory = applySessionInfoTitle(history, sessionId, update.title);
          // History patch alone is enough for a non-noop result when transcript unchanged.
        }
        break;
      }
      case 'usage_update': {
        const usage = parseUsageUpdate(update);
        if (usage !== undefined) {
          next = { ...next, usage };
          sessionChanged = true;
          usageChanged = true;
        }
        break;
      }
      default:
        break;
    }
  }

  if (!sessionChanged && sessionHistory === undefined && !usageChanged) {
    return { kind: 'noop' };
  }

  return {
    kind: 'patch',
    session: next,
    sessionHistory,
    usageChanged,
  };
};
