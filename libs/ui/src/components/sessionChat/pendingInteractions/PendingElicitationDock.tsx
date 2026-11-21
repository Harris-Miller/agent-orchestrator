import Box from '@mui/material/Box';
import type { FC } from 'react';

import { agentLaunchTargetLabel } from '../../../host/agentLaunchTarget.ts';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';
import { PendingElicitationCard } from './PendingElicitationCard.tsx';
import { useElicitationReply } from './useElicitationReply.ts';
import { WaitingCount } from './WaitingCount.tsx';

/** Cap on the pinned Pending elicitation section so the transcript stays visible. */
const PENDING_ELICITATION_MAX_HEIGHT = '65%';

/** The Pending elicitation, pinned between the transcript and the Composer. */
export const PendingElicitationDock: FC = () => {
  const { selectedLaunchTarget, selectedSession } = useSessionChatSurface();
  const { cancelElicitation, replyToElicitation } = useElicitationReply();

  if (selectedSession?.pendingElicitation === undefined || selectedLaunchTarget === undefined) {
    return null;
  }

  return (
    <Box
      sx={{
        flex: '0 1 auto',
        maxHeight: PENDING_ELICITATION_MAX_HEIGHT,
        minHeight: 0,
        overflowY: 'auto',
        px: 1,
        py: 0.5,
      }}
    >
      <WaitingCount count={selectedSession.waitingElicitations?.length ?? 0} />
      <PendingElicitationCard
        agentTitle={agentLaunchTargetLabel(selectedLaunchTarget)}
        key={selectedSession.pendingElicitation.id}
        onAccept={(content, summary) => {
          replyToElicitation({ response: { action: 'accept', content }, summary });
        }}
        onCancel={cancelElicitation}
        onDecline={() => {
          replyToElicitation({ response: { action: 'decline' } });
        }}
        request={selectedSession.pendingElicitation.request}
      />
    </Box>
  );
};
