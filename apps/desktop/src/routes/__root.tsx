import { HarnessMounts, HarnessPrerequisites, VscodeExtensionUpdateDialog } from '@lib/ui';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FC } from 'react';

const RootComponent: FC = () => (
  <HarnessPrerequisites
    onExit={() => {
      getCurrentWindow()
        .close()
        .catch(() => undefined);
    }}
  >
    <HarnessMounts>
      <VscodeExtensionUpdateDialog />
      <Outlet />
    </HarnessMounts>
  </HarnessPrerequisites>
);

export const Route = createRootRoute({
  component: RootComponent,
});
