import type { AgentCapabilities } from '../../host/agentCapabilities.ts';

export type SessionActionAvailabilityInput = {
  readonly archived: boolean;
  /** Whether the host wired Rename (a Session header or History row with an inline title). */
  readonly canRename: boolean;
  readonly capabilities: Pick<AgentCapabilities, 'sessionArchive' | 'sessionClose' | 'sessionRename'>;
  /** The History entry itself is marked unavailable (hides Rename). */
  readonly entryUnavailable: boolean;
  readonly pinsLoaded: boolean;
  readonly sessionActive: boolean;
  /** The entry cannot be acted on right now (marked unavailable or provider not usable). */
  readonly unavailable: boolean;
  readonly usablePhase: boolean;
};

type ActionState = { readonly disabled: boolean };

/** Which Session actions show for a History entry (`undefined` = hidden) and which of those are disabled. */
export type SessionActionAvailability = {
  readonly archive: ActionState | undefined;
  readonly close: ActionState | undefined;
  readonly delete: ActionState;
  readonly pin: ActionState;
  readonly rename: ActionState | undefined;
  readonly unarchive: ActionState | undefined;
};

/** Shared by the Session actions menu (History rows) and the Session header buttons so the rules cannot diverge. */
export const sessionActionAvailability = ({
  archived,
  canRename,
  capabilities,
  entryUnavailable,
  pinsLoaded,
  sessionActive,
  unavailable,
  usablePhase,
}: SessionActionAvailabilityInput): SessionActionAvailability => ({
  archive: !archived && capabilities.sessionArchive ? { disabled: unavailable } : undefined,
  close: !archived && capabilities.sessionClose ? { disabled: unavailable || !sessionActive } : undefined,
  delete: { disabled: unavailable },
  pin: { disabled: !pinsLoaded },
  rename:
    !archived && canRename && !entryUnavailable && capabilities.sessionRename ? { disabled: !usablePhase } : undefined,
  unarchive: archived && capabilities.sessionArchive ? { disabled: unavailable } : undefined,
});
