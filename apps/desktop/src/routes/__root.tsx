import {
  AcpBackendsMount,
  FdPrerequisiteGate,
  HarnessCacheGate,
  PersistUserSettingsToast,
  UserSettingsMount,
} from '@lib/ui';
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
      <HarnessCacheGate>
        <AcpBackendsMount />
        <UserSettingsMount />
        <PersistUserSettingsToast />
        <Outlet />
      </HarnessCacheGate>
    </FdPrerequisiteGate>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
