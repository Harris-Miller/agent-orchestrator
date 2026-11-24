import { RegistryContext } from '@effect/atom-react';
import { useContext, useEffect } from 'react';
import type { FC } from 'react';

import { APP_UPDATE_CHECK_INTERVAL_MS, checkAppUpdate } from '../atoms/appUpdate.atoms.ts';

/** Checks for an App update on startup and every 6 h. Renders nothing. */
export const AppUpdateCheckMount: FC = () => {
  const registry = useContext(RegistryContext);
  useEffect(() => {
    checkAppUpdate(registry).catch(() => undefined);
    const timer = setInterval(() => {
      checkAppUpdate(registry).catch(() => undefined);
    }, APP_UPDATE_CHECK_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [registry]);
  return null;
};
