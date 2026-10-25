import { useAtomValue } from '@effect/atom-react';
import { AsyncResult } from 'effect/reactivity';
import { useEffect, useRef } from 'react';
import type { FC } from 'react';

import { persistUserSettingsAtomFn } from '../atoms/boundHarnessAtoms.ts';

import { showClientErrorToast } from './showClientErrorToast.ts';

const PERSIST_FAILURE_MESSAGE = 'Failed to save User Settings to disk.';

/** Root toast when User settings persist fails (memory stays Success). */
export const PersistUserSettingsToast: FC = () => {
  const persistResult = useAtomValue(persistUserSettingsAtomFn);
  const dismissedFailure = useRef<unknown>(undefined);

  useEffect(() => {
    if (!AsyncResult.isFailure(persistResult) || persistResult.cause === dismissedFailure.current) {
      return;
    }
    dismissedFailure.current = persistResult.cause;
    showClientErrorToast(PERSIST_FAILURE_MESSAGE);
  }, [persistResult]);

  return null;
};
