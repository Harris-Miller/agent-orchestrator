import { RegistryContext, useAtomSet } from '@effect/atom-react';
import { useCallback, useContext } from 'react';

import { checkLatestAtomFn, providerViewsAtom, refreshProviderAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { providersToCheckForUpdates } from '../../host/providerView.ts';

/**
 * Returns a function that refreshes Provider runtime info, then runs Check for latest on every eligible Provider.
 * Pass `isCancelled` to skip the checks if the caller went away during the refresh.
 */
export const useCheckProviderUpdates = (): ((isCancelled?: () => boolean) => Promise<void>) => {
  const refresh = useAtomSet(refreshProviderAtomFn, { mode: 'promise' });
  const registry = useContext(RegistryContext);
  return useCallback(
    async isCancelled => {
      // Read fresh runtime info first: Check for latest compares against the on-disk Active and downloaded versions.
      // refreshProviderAtomFn is shared: a concurrent caller supersedes this run, so the promise may settle with
      // the other run's result or reject. Either way the on-disk info is as fresh as it will get; always check.
      await refresh(undefined).catch(() => undefined);
      if (isCancelled?.() === true) {
        return;
      }
      for (const id of providersToCheckForUpdates(registry.get(providerViewsAtom))) {
        registry.set(checkLatestAtomFn(id), id);
      }
    },
    [refresh, registry],
  );
};
