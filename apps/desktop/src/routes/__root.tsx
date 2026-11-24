import { HarnessMounts, HarnessPrerequisites, VscodeExtensionUpdateDialog } from '@lib/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FC } from 'react';

import { AppUpdateCheckMount } from '../components/AppUpdateCheckMount.tsx';

const RootComponent: FC = () => {
  return (
    <HarnessPrerequisites
      onExit={() => {
        getCurrentWindow()
          .close()
          .catch(() => undefined);
      }}
    >
      <HarnessMounts>
        <AppUpdateCheckMount />
        <VscodeExtensionUpdateDialog />
        <Outlet />
      </HarnessMounts>
    </HarnessPrerequisites>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
