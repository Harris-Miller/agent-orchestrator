import { RegistryContext, useAtomValue } from '@effect/atom-react';
import { UpdatesIndicator } from '@lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { useContext } from 'react';
import type { FC } from 'react';

import {
  appUpdateAtom,
  checkAppUpdate,
  downloadAppUpdate,
  installAppUpdate,
  retryAppUpdate,
} from '../atoms/appUpdate.atoms.ts';

/** Desktop wiring for the shared Updates indicator: supplies the App update and the Settings > Providers link. */
export const UpdatesIndicatorHost: FC = () => {
  const navigate = useNavigate();
  const registry = useContext(RegistryContext);
  const state = useAtomValue(appUpdateAtom);
  return (
    <UpdatesIndicator
      app={{
        onCheck: () => {
          checkAppUpdate(registry).catch(() => undefined);
        },
        onDownload: () => {
          downloadAppUpdate(registry).catch(() => undefined);
        },
        onInstall: () => {
          installAppUpdate(registry).catch(() => undefined);
        },
        onRetry: () => {
          retryAppUpdate(registry).catch(() => undefined);
        },
        state,
      }}
      onOpenProviders={() => {
        navigate({ params: { category: 'providers' }, to: '/settings/$category' }).catch(() => undefined);
      }}
    />
  );
};
