import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import type { SubagentSnapshot } from '../../../../host/subagent.ts';
import { LucideMuiIcon } from '../../../LucideMuiIcon.tsx';

import { subagentStatus } from './subagentStateLabel.ts';
import type { SubagentStatus } from './subagentStateLabel.ts';

const TOOLTIPS: Record<SubagentStatus, string> = {
  cancelled: 'Cancelled',
  failed: 'Failed',
  finished: 'Finished',
  needs_input: 'Needs input',
  running: 'Running',
  unknown: 'Unknown',
};

const ICONS: Record<Exclude<SubagentStatus, 'needs_input'>, ReactNode> = {
  cancelled: <LucideMuiIcon fontSize="small" icon={CircleX} sx={{ color: 'text.secondary' }} />,
  failed: <LucideMuiIcon color="error" fontSize="small" icon={CircleX} />,
  finished: <LucideMuiIcon color="success" fontSize="small" icon={CircleCheck} />,
  running: <CircularProgress size={16} sx={{ color: 'text.secondary' }} />,
  unknown: <LucideMuiIcon fontSize="small" icon={CircleHelp} sx={{ color: 'text.secondary' }} />,
};

/** Icon-only status (spinner, check, X) shown left of a subagent's title; only "needs input" is a pill. */
export const SubagentStatusIndicator: FC<{ readonly child: SubagentSnapshot }> = ({ child }) => {
  const status = subagentStatus(child);
  if (status === 'needs_input') {
    return (
      <Chip
        color="warning"
        icon={<LucideMuiIcon icon={TriangleAlert} />}
        label="Needs input"
        size="small"
        variant="outlined"
      />
    );
  }
  const icon = ICONS[status];
  return (
    <Tooltip title={TOOLTIPS[status]}>
      <span aria-label={TOOLTIPS[status]} style={{ alignItems: 'center', display: 'inline-flex' }}>
        {icon}
      </span>
    </Tooltip>
  );
};
