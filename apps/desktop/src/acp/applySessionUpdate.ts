/** Session update apply: one inbound session/update → next snapshot (+ roster title). */
import { isRecord } from '../utils.ts';

import { applySessionInfoTitle, applySetConfigOptionResult, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo, SessionSnapshot } from './acpSessionBootstrap.ts';
import {
  appendUserChatMessage,
  parseAvailableCommands,
  parseUsageUpdate,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';

export type ApplySessionUpdateResult =
  | { readonly kind: 'noop' }
  | {
      readonly kind: 'patch';
      readonly session: SessionSnapshot;
      readonly sessionRoster?: readonly NormalizedSessionInfo[];
      readonly shouldSyncConfig: boolean;
      readonly usageChanged: boolean;
    };

/** Append a local user prompt to the session transcript; other snapshot fields unchanged. */
export const withUserChatMessage = (session: SessionSnapshot, text: string): SessionSnapshot => ({
  ...session,
  transcript: appendUserChatMessage(session.transcript, text),
});

/**
 * Fold one raw session/update into the next session snapshot (and roster title when needed).
 * Seeds a missing session from `initialSessionSnapshot`. Pure — no disk, no atoms.
 */
export const applySessionUpdate = (
  session: SessionSnapshot | undefined,
  sessionId: string,
  roster: readonly NormalizedSessionInfo[],
  update: unknown,
): ApplySessionUpdateResult => {
  const base = session ?? initialSessionSnapshot(sessionId);
  const nextTranscript = reduceSessionUpdate(base.transcript, update);
  const transcriptChanged = nextTranscript !== base.transcript;

  let next: SessionSnapshot = transcriptChanged ? { ...base, transcript: nextTranscript } : base;
  let sessionChanged = transcriptChanged;
  let usageChanged = false;
  let shouldSyncConfig = false;
  let sessionRoster: readonly NormalizedSessionInfo[] | undefined;

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
          shouldSyncConfig = next.status !== 'activating';
        }
        break;
      }
      case 'session_info_update': {
        if (typeof update.title === 'string') {
          sessionRoster = applySessionInfoTitle(roster, sessionId, update.title);
          // Roster patch alone is enough for a non-noop result when transcript unchanged.
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

  if (!sessionChanged && sessionRoster === undefined && !shouldSyncConfig && !usageChanged) {
    return { kind: 'noop' };
  }

  return {
    kind: 'patch',
    session: next,
    sessionRoster,
    shouldSyncConfig,
    usageChanged,
  };
};
