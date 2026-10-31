import {
  AcpBackendsMount,
  FdPrerequisiteGate,
  HarnessCacheGate,
  NodePrerequisiteGate,
  PersistUserSettingsToast,
  ProviderBootstrapGate,
  UserSettingsMount,
} from '@lib/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FC } from 'react';

const RootComponent: FC = () => {
  return (
    <>
      {/* Settings load outside the gates that depend on them. */}
      <UserSettingsMount />
      <PersistUserSettingsToast />
      <FdPrerequisiteGate
        onExit={() => {
          getCurrentWindow()
            .close()
            .catch(() => undefined);
        }}
      >
        <NodePrerequisiteGate>
          <ProviderBootstrapGate>
            <HarnessCacheGate>
              <AcpBackendsMount />
              <Outlet />
            </HarnessCacheGate>
          </ProviderBootstrapGate>
        </NodePrerequisiteGate>
      </FdPrerequisiteGate>
    </>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
