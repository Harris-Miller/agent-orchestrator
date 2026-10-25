import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Button, ensureVirtualSessionAtomFn } from '@lib/ui';
import { PlusIcon } from 'lucide-react';
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
    <Button
      aria-label="Create session"
      disabled={disabled || sessionCwd === undefined}
      onClick={() => {
        if (sessionCwd === undefined) {
          return;
        }
        ensureVirtualSession({ cwd: sessionCwd }).catch(onClientError);
      }}
      size="icon-sm"
      variant="ghost"
    >
      <PlusIcon />
    </Button>
  );
};
