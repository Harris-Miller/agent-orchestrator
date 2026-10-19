import { HarnessMounts, HarnessPrerequisites, VscodeExtensionUpdateDialog } from '@lib/ui';
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import type { FC } from 'react';

import { checkForAppUpdate } from '../checkForAppUpdate.ts';

const RootComponent: FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    checkForAppUpdate().catch(() => undefined);
  }, []);

  return (
    <HarnessPrerequisites
      onExit={() => {
        getCurrentWindow()
          .close()
          .catch(() => undefined);
      }}
    >
      <HarnessMounts
        onOpenProviders={() => {
          navigate({ params: { category: 'providers' }, to: '/settings/$category' }).catch(() => undefined);
        }}
      >
        <VscodeExtensionUpdateDialog />
        <Outlet />
      </HarnessMounts>
    </HarnessPrerequisites>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
