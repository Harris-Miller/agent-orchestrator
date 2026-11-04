import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { ensureVirtualSessionAtomFn, LucideMuiIcon, sessionCwdAtom } from '@lib/ui';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Plus } from 'lucide-react';
import { useContext } from 'react';
import type { FC } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';

/** Shared Create (+) that ensures the one Virtual session with Workspace cwd. */
export const CreateVirtualSessionButton: FC<{ readonly disabled?: boolean }> = ({ disabled = false }) => {
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const onClientError = useContext(OnClientErrorContext);

  return (
    <Tooltip title="Create session">
      <span>
        <IconButton
          aria-label="Create session"
          disabled={disabled || sessionCwd === undefined}
          onClick={() => {
            if (sessionCwd === undefined) {
              return;
            }
            ensureVirtualSession({ cwd: sessionCwd }).catch(onClientError);
          }}
          size="small"
        >
          <LucideMuiIcon fontSize="small" icon={Plus} />
        </IconButton>
      </span>
    </Tooltip>
  );
};
