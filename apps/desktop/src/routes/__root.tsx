import { RegistryProvider } from '@effect/atom-react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { FC } from 'react';

import { AcpBackendsMount } from '../prototype/agentChat/AcpBackendsMount.tsx';

const RootComponent: FC = () => {
  return (
    <RegistryProvider>
      <AcpBackendsMount />
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </RegistryProvider>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
