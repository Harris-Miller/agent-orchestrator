import { useAtomSet } from '@effect/atom-react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { hydrateUserSettingsAtomFn } from '../atoms/index.ts';

/** Eagerly loads user settings into `userSettingsAtom` on app start. */
export const UserSettingsMount: FC = () => {
  const hydrateUserSettings = useAtomSet(hydrateUserSettingsAtomFn, { mode: 'promise' });

  useEffect(() => {
    hydrateUserSettings(undefined).catch(() => undefined);
  }, [hydrateUserSettings]);

  return null;
};
