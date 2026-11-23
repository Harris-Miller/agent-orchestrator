import { HarnessMounts, HarnessPrerequisites, VscodeExtensionUpdateDialog } from '@lib/ui';
import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { FC } from 'react';

const RootComponent: FC = () => {
  const navigate = useNavigate();
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
