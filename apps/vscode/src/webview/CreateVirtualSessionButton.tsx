import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { ensureVirtualSessionAtomFn, LucideMuiIcon } from '@lib/ui';
import IconButton from '@mui/material/IconButton';
import { Plus } from 'lucide-react';
import { useContext } from 'react';
import type { FC } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';
import { sessionCwdAtom } from './workspaceFolderPaths.atoms.ts';

/** Shared Create (+) that ensures the one Virtual session with Workspace cwd. */
export const CreateVirtualSessionButton: FC<{ readonly disabled?: boolean }> = ({ disabled = false }) => {
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const onClientError = useContext(OnClientErrorContext);

  return (
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
  );
};
