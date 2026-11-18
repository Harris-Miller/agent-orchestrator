import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { NormalizedConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

import { ConfigChipRow } from './configChips/ConfigChipRow.tsx';

const noop = () => undefined;

/** Composer-looking, fully disabled dock for the Subagent view: the child's Config chips and a read-only note. */
export const SubagentDock: FC<{
  readonly configOptions: readonly NormalizedConfigOption[];
  readonly launchTarget: AgentLaunchTarget;
  readonly unavailableModelIds: readonly string[] | undefined;
}> = ({ configOptions, launchTarget, unavailableModelIds }) => (
  <Paper
    sx={{
      bgcolor: theme => theme.palette.composerBackground,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 3,
      boxShadow: 3,
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      m: 1,
      p: 1.5,
    }}
  >
    <Typography color="text.secondary" variant="body2">
      Subagent session — read-only.
    </Typography>
    <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      <ConfigChipRow
        agent={{
          disabled: true,
          interactive: false,
          onChange: noop,
          selectableLaunchTargets: [],
          usableLaunchTargets: [],
          value: launchTarget,
        }}
        configDisabled
        configOptions={configOptions}
        onConfigChange={noop}
        unavailableModelIds={unavailableModelIds}
      />
    </Box>
  </Paper>
);
