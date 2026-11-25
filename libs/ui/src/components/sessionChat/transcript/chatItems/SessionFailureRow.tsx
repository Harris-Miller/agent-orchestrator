import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import type { FC } from 'react';

import {
  ensureVirtualSessionAtomFn,
  resendPromptAtomFn,
  signInAntigravityAtomFn,
} from '../../../../atoms/boundHarnessAtoms.ts';
import { projectsAtom } from '../../../../atoms/projects.atoms.ts';
import { projectOfRecord } from '../../../../host/projectResolution.ts';
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
  const projects = useAtomValue(projectsAtom);

  const owned = selectedSession !== undefined && selectedLaunchTarget !== undefined && chatItems.includes(item);
  if (!owned) {
    return <SessionFailureView item={item} />;
  }

  // A row offers Continue or Retry, never both: Continue (limit rows) takes precedence.
  const continuable = canContinueFailure(selectedSession, chatItems, item.id);
  const retryMessage = continuable ? Option.none() : retryableUserMessage(selectedSession, chatItems, item.id);

  const send = (text: string) => {
    resend({ launchTarget: selectedLaunchTarget, sessionId: selectedSession.sessionId, text }).catch(onClientError);
  };

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
      // On desktop the new session starts in the Project (its Workspace file or default directories included).
      const project =
        selectedSession.cwd === undefined
          ? undefined
          : projectOfRecord({ ...selectedSession, cwd: selectedSession.cwd }, projects);
      ensureVirtualSession(project === undefined ? { cwd: selectedSession.cwd } : { project })
        .then(() => setVirtualLaunchTarget(selectedLaunchTarget))
        .catch(onClientError);
    },
    ...(continuable
      ? {
          onContinue: () => {
            send(CONTINUE_PROMPT_TEXT);
          },
        }
      : {}),
    ...(Option.isSome(retryMessage)
      ? {
          onRetry: () => {
            send(retryMessage.value.text);
          },
        }
      : {}),
  };
  return <SessionFailureView handlers={handlers} item={item} />;
};
