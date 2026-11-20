import { useAtomMount } from '@effect/atom-react';
import type { FC } from 'react';

import { idleSweepAtom } from '../atoms/boundHarnessAtoms.ts';

/** Closes idle Sessions periodically (Idle session sweep), for the app's lifetime. */
export const IdleSweepMount: FC = () => {
  useAtomMount(idleSweepAtom);
  return null;
};
