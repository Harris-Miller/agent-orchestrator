/** Session update apply: one inbound session/update → next snapshot (+ history title). */
import { isRecord } from '../isRecord.ts';

import { applySessionInfoTitle, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo, SessionSnapshot } from './acpSessionBootstrap.ts';
import { isLoadReplayEnd } from './airMeta.ts';
import { foldConfigOptions } from './sessionConfiguration.ts';
import { parseAvailableCommands, parseUsageUpdate, reduceSessionUpdate } from './sessionUpdateReducer.ts';

export type ApplySessionUpdateResult =
  | { readonly kind: 'noop' }
  | {
      readonly kind: 'patch';
      readonly session: SessionSnapshot;
      readonly sessionHistory?: readonly NormalizedSessionInfo[];
    };

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
          next = { ...next, configuration: foldConfigOptions(next.configuration, update) };
          sessionChanged = true;
        }
        break;
      }
      case 'session_info_update': {
        if (isLoadReplayEnd(update)) {
          if (base.status === 'activating') {
            next = { ...next, replayComplete: true };
            sessionChanged = true;
          }
        } else if (typeof update.title === 'string') {
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
        }
        break;
      }
      default:
        break;
    }
  }

  if (!sessionChanged && sessionHistory === undefined) {
    return { kind: 'noop' };
  }

  return {
    kind: 'patch',
    session: next,
    sessionHistory,
  };
};
