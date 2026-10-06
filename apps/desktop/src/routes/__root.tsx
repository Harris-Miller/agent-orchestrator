import { AcpBackendsMount, FdPrerequisiteGate, PersistUserSettingsToast, UserSettingsMount } from '@lib/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FC } from 'react';

const RootComponent: FC = () => {
  return (
    <FdPrerequisiteGate
      onExit={() => {
        getCurrentWindow()
          .close()
          .catch(() => undefined);
      }}
    >
      <AcpBackendsMount />
      <UserSettingsMount />
      <PersistUserSettingsToast />
      <Outlet />
    </FdPrerequisiteGate>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
