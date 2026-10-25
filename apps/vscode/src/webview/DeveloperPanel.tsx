import { useAtomValue } from '@effect/atom-react';
import type { SessionSnapshot } from '@lib/ui';
import { DeveloperPanelShell, sessionListScopeAtom } from '@lib/ui';
import type { FC } from 'react';

import { sessionCwdAtom, workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';

const WORKSPACE_CWD_TAB = 'workspace-cwd' as const;

const WorkspaceCwdTab: FC = () => {
  const paths = useAtomValue(workspaceFolderPathsAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);

  return (
    <div className="p-4 font-mono text-[11px] break-all whitespace-pre-wrap">
      <div className="mb-1 font-bold">Workspace cwd</div>
      {`sessionCwd: ${sessionCwd ?? '(none)'}
listScope: ${JSON.stringify(listScope)}
paths (${paths.length}):
${paths.length === 0 ? '  (empty)' : paths.map(p => `  - ${p}`).join('\n')}`}
    </div>
  );
};

export const DeveloperPanel: FC<{
  readonly initializeResult: unknown;
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
  readonly session?: SessionSnapshot;
}> = ({ initializeResult, onClose, onCopyError, session }) => (
  <DeveloperPanelShell
    extraTabs={[
      {
        content: <WorkspaceCwdTab />,
        id: WORKSPACE_CWD_TAB,
        label: 'Workspace cwd',
      },
    ]}
    initializeResult={initializeResult}
    onClose={onClose}
    onCopyError={onCopyError}
    session={session}
  />
);
