import { useAtomMount } from '@effect/atom-react';
import type { FC } from 'react';

import { keepAwakeAtom } from '../atoms/boundHarnessAtoms.ts';

/** Holds the computer awake while agents work (Keep awake User setting), for the app's lifetime. */
export const KeepAwakeMount: FC = () => {
  useAtomMount(keepAwakeAtom);
  return null;
};
