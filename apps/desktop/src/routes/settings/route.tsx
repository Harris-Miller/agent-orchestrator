import { useAtomValue } from '@effect/atom-react';
import { isSettingsCategoryId, SettingsShell, workstreamsEnabledAtom } from '@lib/ui';
import Box from '@mui/material/Box';
import type { SettingsCategoryId } from '@lib/ui';
import { createFileRoute, Outlet, redirect, useMatch, useNavigate } from '@tanstack/react-router';

import { PagesShell } from '../../components/PagesShell.tsx';
import { AppTitle } from '../../components/workbenchNavRail/AppTitle.tsx';
import { PageTitle } from '../../components/workbenchNavRail/PageTitle.tsx';

const SettingsRoute = () => {
  const navigate = useNavigate();
  const workstreamsEnabled = useAtomValue(workstreamsEnabledAtom);
  const match = useMatch({ from: '/settings/$category', shouldThrow: false });
  const category = match?.params.category;
  return (
    <PagesShell page="settings">
      <Box sx={{ height: '100vh', overflow: 'hidden' }}>
        <SettingsShell
          appTitle={<AppTitle />}
          pageTitle={<PageTitle>Settings</PageTitle>}
          category={isSettingsCategoryId(category ?? '') ? (category as SettingsCategoryId) : 'general'}
          // The page switcher (Workstreams on) is the way back; without it the Back button stays.
          onBack={
            workstreamsEnabled
              ? undefined
              : () => {
                  navigate({ to: '/' }).catch(() => undefined);
                }
          }
          onSelectCategory={selectedCategory => {
            navigate({ to: '/settings/$category', params: { category: selectedCategory } }).catch(() => undefined);
          }}
        >
          <Outlet />
        </SettingsShell>
      </Box>
    </PagesShell>
  );
};

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings' || location.pathname === '/settings/') {
      // TanStack Router control-flow: redirect is thrown, not an Error.
      // oxlint-disable-next-line typescript/only-throw-error -- redirect()
      throw redirect({ params: { category: 'general' }, to: '/settings/$category' });
    }
  },
  component: SettingsRoute,
});
