import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';

/** Per-provider facts the model picker needs; a launch target without an entry has no well-known options and no Ultracode. */
export type ProviderCapabilities = {
  /** Option ids (any one) that are the boolean Fast toggle. The row is always shown, disabled when none is reported. */
  readonly fastOptionIds: readonly string[];
  /** Collaboration-mode option id (always shown, disabled when not reported); a Plan switch while its choices are just default|plan. */
  readonly planOptionId: string | undefined;
  /** Claude Ultracode: row disabled-reason while no `ultracode` option is advertised; undefined = provider has no Ultracode row. */
  readonly ultracodeUnavailableReason: string | undefined;
};

const CAPABILITIES: Readonly<Partial<Record<AgentLaunchTarget, ProviderCapabilities>>> = {
  'claude-agent-acp': {
    fastOptionIds: ['fast'],
    planOptionId: undefined,
    ultracodeUnavailableReason: 'Not advertised by this provider',
  },
  'codex-acp': {
    fastOptionIds: ['fast-mode', 'fast_mode'],
    planOptionId: 'collaboration_mode',
    ultracodeUnavailableReason: undefined,
  },
};

export const providerCapabilities = (launchTarget: AgentLaunchTarget | undefined): ProviderCapabilities | undefined =>
  launchTarget === undefined ? undefined : CAPABILITIES[launchTarget];
