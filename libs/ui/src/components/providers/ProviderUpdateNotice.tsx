/**
 * Provider update check: after Provider bootstrap and every 6 h, Check for latest on each eligible Provider and
 * notify (once per Provider version) with a link to Settings > Providers. Never downloads or installs.
 */
import { RegistryContext, useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { useContext, useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { checkLatestAtomFn, providerViewsAtom, refreshProviderAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { PROVIDER_META, providersToCheckForUpdates, providerUpdates } from '../../host/providerView.ts';
import type { ProviderUpdate } from '../../host/providerView.ts';

export const PROVIDER_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const keyOf = (update: ProviderUpdate): string => `${update.id}@${update.version}`;

export const ProviderUpdateNotice: FC<{ readonly onOpenProviders: () => void }> = ({ onOpenProviders }) => {
  const providers = useAtomValue(providerViewsAtom);
  const refresh = useAtomSet(refreshProviderAtomFn, { mode: 'promise' });
  const registry = useContext(RegistryContext);
  const notified = useRef(new Set<string>());
  const [shown, setShown] = useState<readonly ProviderUpdate[]>([]);
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    const fresh = providerUpdates(providers).filter(update => !notified.current.has(keyOf(update)));
    if (fresh.length === 0) {
      return;
    }
    for (const update of fresh) {
      notified.current.add(keyOf(update));
    }
    // Keep still-open notices for other Providers; replace a Provider's older version.
    setShown(prev => [...prev.filter(old => !fresh.some(update => update.id === old.id)), ...fresh]);
    setOpen(true);
  }, [providers]);

  const close = () => {
    setOpen(false);
  };

  return (
    <Snackbar
      anchorOrigin={{ horizontal: 'center', vertical: 'bottom' }}
      open={open}
      slotProps={{
        transition: {
          onExited: () => {
            setShown([]);
          },
        },
      }}
    >
      <Alert
        action={
          <Button
            color="inherit"
            onClick={() => {
              close();
              onOpenProviders();
            }}
            size="small"
          >
            View Providers
          </Button>
        }
        onClose={close}
        severity="info"
      >
        Provider updates available:{' '}
        {shown.map(update => `${PROVIDER_META[update.id].label} v${update.version}`).join(', ')}
      </Alert>
    </Snackbar>
  );
};
