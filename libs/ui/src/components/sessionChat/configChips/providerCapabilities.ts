import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';

/** Per-provider facts the model picker needs; a launch target without an entry has no well-known options and no Ultracode. */
export type ProviderCapabilities = {
  /** Option id that is a boolean Fast toggle. */
  readonly fastOptionId: string;
  /** Option id rendered as the "Plan" toggle (on = `plan`, off = `default`); undefined when the provider has none. */
  readonly planOptionId: string | undefined;
  /** Claude Ultracode: row disabled-reason while no `ultracode` option is advertised; undefined = provider has no Ultracode row. */
  readonly ultracodeUnavailableReason: string | undefined;
};

const CAPABILITIES: Readonly<Partial<Record<AgentLaunchTarget, ProviderCapabilities>>> = {
  'claude-agent-acp': {
    fastOptionId: 'fast',
    planOptionId: undefined,
    ultracodeUnavailableReason: 'Not advertised by this provider',
  },
  'codex-acp': {
    fastOptionId: 'fast-mode',
    planOptionId: 'collaboration_mode',
    ultracodeUnavailableReason: undefined,
  },
};

export const providerCapabilities = (launchTarget: AgentLaunchTarget | undefined): ProviderCapabilities | undefined =>
  launchTarget === undefined ? undefined : CAPABILITIES[launchTarget];
