import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { FC } from 'react';

import type { NormalizedConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

import { composerChipRowSx, composerPaperSx } from './composer/composerChrome.ts';
import { ConfigChipRow } from './configChips/ConfigChipRow.tsx';

const noop = () => undefined;

/** Composer-looking, fully disabled dock for the Subagent view: the child's Config chips and a read-only note. */
export const SubagentDock: FC<{
  readonly configOptions: readonly NormalizedConfigOption[];
  readonly launchTarget: AgentLaunchTarget;
  readonly unavailableModelIds: readonly string[] | undefined;
}> = ({ configOptions, launchTarget, unavailableModelIds }) => (
  <Paper sx={[composerPaperSx, { m: 1 }]}>
    <Alert severity="info">Subagent session — read-only.</Alert>
    <Box sx={composerChipRowSx}>
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
