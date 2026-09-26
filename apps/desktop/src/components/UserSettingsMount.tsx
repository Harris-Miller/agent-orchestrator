import { useAtomValue } from '@effect/atom-react';
import type { FC } from 'react';

import { userSettingsAtom } from '../atoms/userSettings/userSettings.atoms.ts';

/** Eagerly loads user settings into `userSettingsAtom` on app start. */
export const UserSettingsMount: FC = () => {
  useAtomValue(userSettingsAtom);
  return null;
};
