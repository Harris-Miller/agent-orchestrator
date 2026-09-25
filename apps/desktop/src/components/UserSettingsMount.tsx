import { useAtomSet } from '@effect/atom-react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { hydrateSettingsAtomFn } from '../atoms/index.ts';

/** Eagerly loads user settings into `userSettingsAtom` on app start. */
export const UserSettingsMount: FC = () => {
  const hydrateSettings = useAtomSet(hydrateSettingsAtomFn, { mode: 'promise' });

  useEffect(() => {
    hydrateSettings(undefined).catch(() => undefined);
  }, [hydrateSettings]);

  return null;
};
