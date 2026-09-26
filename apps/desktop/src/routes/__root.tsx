import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { FC } from 'react';

import { AcpBackendsMount } from '../components/AcpBackendsMount.tsx';
import { PersistUserSettingsToast } from '../components/PersistUserSettingsToast.tsx';
import { UserSettingsMount } from '../components/UserSettingsMount.tsx';

const RootComponent: FC = () => {
  return (
    <>
      <AcpBackendsMount />
      <UserSettingsMount />
      <PersistUserSettingsToast />
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
