import { useAtomMount } from '@effect/atom-react';
import { userSettingsAtom } from '@lib/ui';
import type { FC } from 'react';

/** Eagerly loads user settings into `userSettingsAtom` on app start. */
export const UserSettingsMount: FC = () => {
  useAtomMount(userSettingsAtom);
  return null;
};
