import { RegistryProvider } from '@effect/atom-react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { FC } from 'react';

import { AcpBackendsMount } from '../components/AcpBackendsMount.tsx';
import { SettingsDocumentMount } from '../components/SettingsDocumentMount.tsx';

const RootComponent: FC = () => {
  return (
    <RegistryProvider>
      <AcpBackendsMount />
      <SettingsDocumentMount />
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </RegistryProvider>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
