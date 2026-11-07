import { useAtom } from '@effect/atom-react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Archive } from 'lucide-react';
import type { FC } from 'react';

import { showArchivedSettingAtom } from '../../atoms/boundHarnessAtoms.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

/** Session History header toggle for the Show archived User setting. */
export const ShowArchivedToggle: FC = () => {
  const [showArchived, setShowArchived] = useAtom(showArchivedSettingAtom);
  return (
    <Tooltip title={showArchived ? 'Hide archived' : 'Show archived'}>
      <IconButton
        aria-label="Show archived"
        aria-pressed={showArchived}
        color={showArchived ? 'primary' : 'default'}
        onClick={() => {
          setShowArchived(!showArchived);
        }}
        size="small"
        sx={showArchived ? { bgcolor: 'action.selected' } : undefined}
      >
        <LucideMuiIcon fontSize="small" icon={Archive} />
      </IconButton>
    </Tooltip>
  );
};
