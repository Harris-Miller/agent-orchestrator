import Box from '@mui/material/Box';
import { isSettingsCategoryId, SettingsShell } from '@lib/ui';
import type { SettingsCategoryId } from '@lib/ui';
import { createFileRoute, Outlet, redirect, useMatch, useNavigate } from '@tanstack/react-router';

const SettingsRoute = () => {
  const navigate = useNavigate();
  const match = useMatch({ from: '/settings/$category', shouldThrow: false });
  const category = match?.params.category;
  return (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      <SettingsShell
        category={isSettingsCategoryId(category ?? '') ? (category as SettingsCategoryId) : 'general'}
        onBack={() => {
          navigate({ to: '/' }).catch(() => undefined);
        }}
        onSelectCategory={selectedCategory => {
          navigate({ to: '/settings/$category', params: { category: selectedCategory } }).catch(() => undefined);
        }}
      >
        <Outlet />
      </SettingsShell>
    </Box>
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
