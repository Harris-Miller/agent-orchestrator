import { AcpBackendsMount, UserSettingsMount } from '@lib/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { FC } from 'react';

import { PersistUserSettingsToast } from '../components/PersistUserSettingsToast.tsx';

const RootComponent: FC = () => {
  return (
    <>
      <AcpBackendsMount />
      <UserSettingsMount />
      <PersistUserSettingsToast />
      <Outlet />
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
