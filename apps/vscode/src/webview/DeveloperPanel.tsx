import { useAtomValue } from '@effect/atom-react';
import type { SessionSnapshot } from '@lib/ui';
import { DeveloperPanelShell, sessionListScopeAtom } from '@lib/ui';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { sessionCwdAtom, workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';

const WORKSPACE_CWD_TAB = 'workspace-cwd' as const;

const WorkspaceCwdTab: FC = () => {
  const paths = useAtomValue(workspaceFolderPathsAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);

  return (
    <Box
      component="pre"
      sx={{
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        fontSize: 11,
        m: 0,
        p: 2,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      <Typography component="div" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }} variant="caption">
        Workspace cwd
      </Typography>
      {`sessionCwd: ${sessionCwd ?? '(none)'}
listScope: ${JSON.stringify(listScope)}
paths (${paths.length}):
${paths.length === 0 ? '  (empty)' : paths.map(p => `  - ${p}`).join('\n')}`}
    </Box>
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
