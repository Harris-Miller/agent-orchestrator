import { useAtomValue } from '@effect/atom-react';
import { selectedSessionIdAtom } from '@lib/ui';
import type { FC } from 'react';

import { SessionChatPage } from './SessionChatPage.tsx';
import { SessionHistory } from './SessionHistory.tsx';

/** `/` shell: Session History when no Selected session, else that session’s Chat. */
export const SessionHome: FC = () => {
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  return selectedSessionId === undefined ? <SessionHistory /> : <SessionChatPage />;
};
