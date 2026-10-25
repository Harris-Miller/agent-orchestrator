import type { FC } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';

/** Agent launch target chip — menu when editable (Virtual / handoff); inert chip otherwise. */
export const SessionAgentChip: FC<{
  readonly disabled?: boolean;
  readonly interactive: boolean;
  readonly onChange?: (launchTarget: AgentLaunchTarget) => void;
  readonly readyLaunchTargets: readonly AgentLaunchTarget[];
  readonly value: AgentLaunchTarget | undefined;
}> = ({ disabled = false, interactive, onChange, readyLaunchTargets, value }) => {
  const label = value === undefined ? 'Agent' : agentLaunchTargetLabel(value);
  const chip = (
    <>
      {value !== undefined ? <AgentLaunchTargetIcon launchTarget={value} size={14} /> : null}
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
    </>
  );

  if (!interactive) {
    return (
      <ComposerChromeChip disabled={disabled} interactive={false}>
        {chip}
      </ComposerChromeChip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<ComposerChromeChip disabled={disabled} />}>{chip}</DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44" side="top">
        {readyLaunchTargets.map(launchTarget => (
          <DropdownMenuItem
            className={value === launchTarget ? 'bg-accent' : undefined}
            key={launchTarget}
            onClick={() => {
              onChange?.(launchTarget);
            }}
          >
            <AgentLaunchTargetIcon launchTarget={launchTarget} />
            {agentLaunchTargetLabel(launchTarget)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
