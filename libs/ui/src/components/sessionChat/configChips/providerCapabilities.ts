import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';

/** Per-provider facts the model picker needs; a launch target without an entry has no well-known options and no Ultra. */
export type ProviderCapabilities = {
  /** Option id that is a boolean Fast toggle. */
  readonly fastOptionId: string;
  /** Option id rendered as the "Plan" toggle (on = `plan`, off = `default`); undefined when the provider has none. */
  readonly planOptionId: string | undefined;
  readonly ultraLabel: string;
  /** Row disabled-reason when the provider advertises no Ultra control. */
  readonly ultraUnavailableReason: string;
};

const CAPABILITIES: Readonly<Partial<Record<AgentLaunchTarget, ProviderCapabilities>>> = {
  'claude-agent-acp': {
    fastOptionId: 'fast',
    planOptionId: undefined,
    ultraLabel: 'Ultracode',
    ultraUnavailableReason: 'Not advertised by this provider',
  },
  'codex-acp': {
    fastOptionId: 'fast-mode',
    planOptionId: 'collaboration_mode',
    ultraLabel: 'Ultra',
    ultraUnavailableReason: 'Not supported by this model',
  },
};

export const providerCapabilities = (launchTarget: AgentLaunchTarget | undefined): ProviderCapabilities | undefined =>
  launchTarget === undefined ? undefined : CAPABILITIES[launchTarget];
