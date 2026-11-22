import { useAtomValue } from '@effect/atom-react';
import { useClientErrorSnackbar, userSettingsLoadedAtom, workstreamsEnabledAtom } from '@lib/ui';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import type { FC } from 'react';

import { PagesShell } from '../components/PagesShell.tsx';
import { WorkstreamsPage } from '../components/workstreamsPage/WorkstreamsPage.tsx';

const Workstreams: FC = () => {
  const { clientErrorSnackbar, onClientError } = useClientErrorSnackbar();
  const enabled = useAtomValue(workstreamsEnabledAtom);
  const loaded = useAtomValue(userSettingsLoadedAtom);

  // Experimental: Workstreams off → this page does not exist; go back to the Sessions Page.
  if (loaded && !enabled) return <Navigate replace to="/" />;
  return (
    <PagesShell page="workstreams">
      <WorkstreamsPage onClientError={onClientError} />
      {clientErrorSnackbar}
    </PagesShell>
  );
};

export const Route = createFileRoute('/workstreams')({
  component: Workstreams,
});
