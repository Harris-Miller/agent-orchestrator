import { isUsablePhase } from '../../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';

export const isSessionHistoryEntryAvailable = (
  entry: UnifiedHistoryEntry,
  phase: BackendHarnessSnapshot['phase'] | undefined,
): boolean => entry.unavailable !== true && phase !== undefined && isUsablePhase(phase);
