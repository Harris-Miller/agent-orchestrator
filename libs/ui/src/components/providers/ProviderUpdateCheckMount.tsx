/**
 * Provider update check: after Provider bootstrap and every 6 h, Check for latest on each eligible Provider.
 * Results surface in the Updates indicator. Never downloads or installs.
 */
import { RegistryContext, useAtomSet } from '@effect/atom-react';
import { useContext, useEffect } from 'react';
import type { FC } from 'react';

import { checkLatestAtomFn, providerViewsAtom, refreshProviderAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { providersToCheckForUpdates } from '../../host/providerView.ts';

export const PROVIDER_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const ProviderUpdateCheckMount: FC = () => {
  const refresh = useAtomSet(refreshProviderAtomFn, { mode: 'promise' });
  const registry = useContext(RegistryContext);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      // Read fresh runtime info first: Check for latest compares against the on-disk Active and downloaded versions.
      // refreshProviderAtomFn is shared: a concurrent caller supersedes this run, so the promise may settle with
      // the other run's result or reject. Either way the on-disk info is as fresh as it will get; always check.
      refresh(undefined)
        .catch(() => undefined)
        .then(() => {
          if (cancelled) {
            return;
          }
          for (const id of providersToCheckForUpdates(registry.get(providerViewsAtom))) {
            registry.set(checkLatestAtomFn(id), id);
          }
        });
    };
    check();
    const timer = setInterval(check, PROVIDER_UPDATE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refresh, registry]);

  return null;
};
