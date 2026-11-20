import CircularProgress from '@mui/material/CircularProgress';
import { CircleAlert, MessageCircleQuestion } from 'lucide-react';
import type { FC } from 'react';

import type { AirActivityState } from '../../host/airMeta.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

/** Row badge for an **Activity state**: spinner while running, an icon when the Session needs input or errored. */
export const SessionActivityBadge: FC<{ readonly state: AirActivityState }> = ({ state }) => {
  switch (state) {
    case 'running':
      return <CircularProgress aria-label="Running" size={14} sx={{ flexShrink: 0 }} />;
    case 'requires_action':
      return (
        <LucideMuiIcon
          icon={MessageCircleQuestion}
          titleAccess="Needs input"
          sx={{ color: 'warning.main', flexShrink: 0, fontSize: '0.9rem' }}
        />
      );
    case 'error':
      return (
        <LucideMuiIcon
          icon={CircleAlert}
          titleAccess="Error"
          sx={{ color: 'error.main', flexShrink: 0, fontSize: '0.9rem' }}
        />
      );
  }
};
