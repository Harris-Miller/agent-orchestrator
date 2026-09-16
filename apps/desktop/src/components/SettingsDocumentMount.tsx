import { useAtomSet } from '@effect/atom-react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { hydrateSettingsAtomFn } from '../atoms/index.ts';

/** Eagerly loads the Settings document into `settingsDocumentAtom` on app start. */
export const SettingsDocumentMount: FC = () => {
  const hydrateSettings = useAtomSet(hydrateSettingsAtomFn, { mode: 'promise' });

  useEffect(() => {
    hydrateSettings(undefined).catch(() => undefined);
  }, [hydrateSettings]);

  return null;
};
