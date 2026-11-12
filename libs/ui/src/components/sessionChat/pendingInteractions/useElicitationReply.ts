import { useAtomSet, useAtomValue } from '@effect/atom-react';

import { selectedSessionAtom } from '../../../atoms/backendState.atoms.ts';
import { respondElicitationAtomFn } from '../../../atoms/boundHarnessAtoms.ts';
import type { ElicitationReply } from '../../../atoms/chat.atoms.ts';
import { composerAtom } from '../../../atoms/composer.atoms.ts';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';

/** Replies to the Selected session's Pending elicitation; shared by the elicitation dock and the Composer's Escape. */
export const useElicitationReply = () => {
  const { onClientError } = useSessionChatSurface();
  const selectedLaunchTarget = useAtomValue(composerAtom).target?.launchTarget;
  const selectedSession = useAtomValue(selectedSessionAtom);
  const respondElicitation = useAtomSet(respondElicitationAtomFn, { mode: 'promise' });

  const replyToElicitation = (reply: ElicitationReply) => {
    if (selectedLaunchTarget === undefined || selectedSession?.pendingElicitation === undefined) {
      return;
    }
    respondElicitation({
      ...reply,
      launchTarget: selectedLaunchTarget,
      sessionId: selectedSession.sessionId,
    }).catch(onClientError);
  };

  const cancelElicitation = () => {
    replyToElicitation({ response: { action: 'cancel' } });
  };

  return { cancelElicitation, replyToElicitation };
};
