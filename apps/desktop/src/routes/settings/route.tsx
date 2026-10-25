import { createFileRoute, redirect } from '@tanstack/react-router';

import { SettingsShell } from '../../components/settings/SettingsShell.tsx';

export const Route = createFileRoute('/settings')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings' || location.pathname === '/settings/') {
      // TanStack Router control-flow: redirect is thrown, not an Error.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirect()
      throw redirect({ params: { category: 'general' }, to: '/settings/$category' });
    }
  },
  component: () => (
    <div className="h-screen overflow-hidden">
      <SettingsShell />
    </div>
  ),
});
