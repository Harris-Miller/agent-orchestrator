import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import type { FC, ReactNode } from 'react';

import { subagentViewAtom } from '../../atoms/backendState.atoms.ts';
import { Composer } from './composer/Composer.tsx';
import { usePreloadSessionFsListing } from './composer/menu/usePreloadSessionFsListing.ts';
import { PendingElicitationDock } from './pendingInteractions/PendingElicitationDock.tsx';
import { SubagentView } from './SubagentView.tsx';
import { ChatTranscript } from './transcript/ChatTranscript.tsx';
import { SessionChatSurfaceProvider } from './useSessionChatSurface.tsx';

const SessionChatBodyInner: FC<{
  readonly aboveComposer?: ReactNode;
  readonly virtualEmptyState?: ReactNode;
}> = ({ aboveComposer, virtualEmptyState }) => {
  usePreloadSessionFsListing();

  return (
    <Box
      component="main"
      sx={{
        bgcolor: 'background.default',
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        gap: 0.5,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        p: 0.5,
      }}
    >
      <ChatTranscript virtualEmptyState={virtualEmptyState} />
      <PendingElicitationDock />
      <Composer aboveComposer={aboveComposer} />
    </Box>
  );
};

export const SessionChatBody: FC<{
  readonly aboveComposer?: ReactNode;
  readonly onClientError: (error: unknown) => void;
  readonly virtualEmptyState?: ReactNode;
}> = props => {
  const subagentView = useAtomValue(subagentViewAtom);
  return subagentView === undefined ? (
    <SessionChatSurfaceProvider onClientError={props.onClientError}>
      <SessionChatBodyInner aboveComposer={props.aboveComposer} virtualEmptyState={props.virtualEmptyState} />
    </SessionChatSurfaceProvider>
  ) : (
    <SubagentView onClientError={props.onClientError} />
  );
};
