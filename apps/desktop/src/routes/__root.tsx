import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { FC } from 'react';

import { AcpBackendsMount } from '../components/AcpBackendsMount.tsx';
import { UserSettingsMount } from '../components/UserSettingsMount.tsx';

const RootComponent: FC = () => {
  return (
    <>
      <AcpBackendsMount />
      <UserSettingsMount />
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
