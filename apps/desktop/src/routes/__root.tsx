import { RegistryProvider } from '@effect/atom-react';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { FC } from 'react';

import { AcpBackendsMount } from '../prototype/agentChat/AcpBackendsMount.tsx';

const RootComponent: FC = () => {
  return (
    <RegistryProvider>
      <AcpBackendsMount />
      <Outlet />
      <ReactQueryDevtools />
      <TanStackRouterDevtools />
    </RegistryProvider>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
