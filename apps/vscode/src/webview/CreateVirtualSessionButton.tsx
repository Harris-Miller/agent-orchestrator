import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { ensureVirtualSessionAtomFn, IconTooltipButton, sessionCwdAtom } from '@lib/ui';
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
    <IconTooltipButton
      disabled={disabled || sessionCwd === undefined}
      icon={Plus}
      label="Create session"
      onClick={() => {
        if (sessionCwd === undefined) {
          return;
        }
        ensureVirtualSession({ cwd: sessionCwd }).catch(onClientError);
      }}
    />
  );
};
