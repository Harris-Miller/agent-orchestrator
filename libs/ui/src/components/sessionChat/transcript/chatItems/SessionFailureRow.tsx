import { useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import type { FC } from 'react';

import {
  ensureVirtualSessionAtomFn,
  resendPromptAtomFn,
  signInAntigravityAtomFn,
} from '../../../../atoms/boundHarnessAtoms.ts';
import { PROVIDER_META } from '../../../../host/providerView.ts';
import {
  canContinueFailure,
  CONTINUE_PROMPT_TEXT,
  retryableUserMessage,
} from '../../../../host/sessionFailureRetry.ts';
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

  const retryMessage =
    item.category === 'limit' ? Option.none() : retryableUserMessage(selectedSession, chatItems, item.id);

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
    ...(canContinueFailure(selectedSession, chatItems, item.id)
      ? {
          onContinue: () => {
            resend({
              launchTarget: selectedLaunchTarget,
              sessionId: selectedSession.sessionId,
              text: CONTINUE_PROMPT_TEXT,
            }).catch(onClientError);
          },
        }
      : {}),
    ...(Option.isSome(retryMessage)
      ? {
          onRetry: () => {
            resend({
              launchTarget: selectedLaunchTarget,
              sessionId: selectedSession.sessionId,
              text: retryMessage.value.text,
            }).catch(onClientError);
          },
        }
      : {}),
  };
  return <SessionFailureView handlers={handlers} item={item} />;
};
