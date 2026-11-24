/**
 * Provider update check: after Provider bootstrap and every 6 h, Check for latest on each eligible Provider.
 * Results surface in the Updates indicator. Never downloads or installs.
 */
import { useEffect } from 'react';
import type { FC } from 'react';

import { useCheckProviderUpdates } from './useCheckProviderUpdates.ts';

/** How often Provider and App updates are re-checked. */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const ProviderUpdateCheckMount: FC = () => {
  const checkAll = useCheckProviderUpdates();

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      checkAll(() => cancelled).catch(() => undefined);
    };
    check();
    const timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [checkAll]);

  return null;
};
