import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  ownedSessionKeysAtom,
  selectedAtom,
  sessionEntryKey,
  useClientErrorSnackbar,
  visibleSessionHistoryAtom,
  workstreamsEnabledAtom,
} from '@lib/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { FC } from 'react';

import { AgentChatWorkbench } from '../components/AgentChatWorkbench.tsx';
import { PagesShell } from '../components/PagesShell.tsx';

const Index: FC = () => {
  const { clientErrorSnackbar, onClientError } = useClientErrorSnackbar();
  const enabled = useAtomValue(workstreamsEnabledAtom);
  const owned = useAtomValue(ownedSessionKeysAtom);
  const history = useAtomValue(visibleSessionHistoryAtom);
  const selected = useAtomValue(selectedAtom);
  const setSelected = useAtomSet(selectedAtom);

  // A Selected session a Workstream owns is not on this page while Workstreams is on: clear it (the workbench falls back to a new session).
  useEffect(() => {
    if (!enabled || selected?._tag !== 'Session') return;
    const entry = history.find(candidate => candidate.sessionId === selected.sessionId);
    if (entry !== undefined && owned.has(sessionEntryKey(entry))) setSelected(undefined);
  }, [enabled, selected, history, owned, setSelected]);

  return (
    <PagesShell page="sessions">
      <AgentChatWorkbench onClientError={onClientError} />
      {clientErrorSnackbar}
    </PagesShell>
  );
};

export const Route = createFileRoute('/')({
  component: Index,
});
