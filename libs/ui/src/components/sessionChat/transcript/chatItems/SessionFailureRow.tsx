import { useAtomSet } from '@effect/atom-react';
import type { FC } from 'react';

import {
  ensureVirtualSessionAtomFn,
  resendPromptAtomFn,
  signInAntigravityAtomFn,
} from '../../../../atoms/boundHarnessAtoms.ts';
import { PROVIDER_META } from '../../../../host/providerView.ts';
import { useSessionChatSurface } from '../../useSessionChatSurface.tsx';

import type { ChatItemOf } from './chatItemOf.ts';
import { SessionFailureView } from './SessionFailureView.tsx';
import type { SessionFailureHandlers } from './SessionFailureView.tsx';

/**
 * A Session failure row wired to the Selected session. Actions need that session's chat to hold this row, so rows of
 * a subagent's child session render without buttons.
 */
export const SessionFailureRow: FC<{ readonly item: ChatItemOf<'session_failure'> }> = ({ item }) => {
  const { chatItems, onClientError, selectedLaunchTarget, selectedSession, setVirtualLaunchTarget } =
    useSessionChatSurface();
  const resend = useAtomSet(resendPromptAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const signIn = useAtomSet(signInAntigravityAtomFn, { mode: 'promise' });

  const owned = selectedSession !== undefined && selectedLaunchTarget !== undefined && chatItems.includes(item);
  if (!owned) {
    return <SessionFailureView item={item} />;
  }

  const lastUserMessage = chatItems.findLast(entry => entry.kind === 'user_message');
  // Images are slim refs in the transcript and would be dropped on a re-send.
  const canRetry =
    selectedSession.status === 'active' &&
    selectedSession.pendingClientRequest === undefined &&
    lastUserMessage?.kind === 'user_message' &&
    (lastUserMessage.images ?? []).length === 0;

  const handlers: SessionFailureHandlers = {
    login: {
      hint: PROVIDER_META[selectedLaunchTarget].signIn.hint,
      ...(selectedLaunchTarget === 'antigravity-acp'
        ? {
            onSignIn: () => {
              signIn(undefined).catch(onClientError);
            },
          }
        : {}),
    },
    onNewSession: () => {
      ensureVirtualSession({ cwd: selectedSession.cwd })
        .then(() => setVirtualLaunchTarget(selectedLaunchTarget))
        .catch(onClientError);
    },
    ...(canRetry
      ? {
          onRetry: () => {
            resend({
              launchTarget: selectedLaunchTarget,
              sessionId: selectedSession.sessionId,
              text: lastUserMessage.text,
            }).catch(onClientError);
          },
        }
      : {}),
  };
  return <SessionFailureView handlers={handlers} item={item} />;
};
