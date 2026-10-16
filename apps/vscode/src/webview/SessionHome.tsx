import { useAtomValue } from '@effect/atom-react';
import { selectedAtom } from '@lib/ui';
import type { FC } from 'react';

import { SessionChatPage } from './SessionChatPage.tsx';
import { SessionHistory } from './SessionHistory.tsx';

/** `/` shell: Session History when no Selected; Chat when Virtual or Session. */
export const SessionHome: FC = () => {
  const selected = useAtomValue(selectedAtom);
  return selected === undefined ? <SessionHistory /> : <SessionChatPage />;
};
