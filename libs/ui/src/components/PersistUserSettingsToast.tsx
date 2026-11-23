import { useAtomValue } from '@effect/atom-react';
import { AsyncResult } from 'effect/reactivity';
import { useState } from 'react';
import type { FC } from 'react';

import { persistUserSettingsAtomFn } from '../atoms/boundHarnessAtoms.ts';
import { Toast } from './Toast.tsx';

const PERSIST_FAILURE_MESSAGE = 'Failed to save User Settings to disk.';

/** Root toast when User settings persist fails (memory stays Success). */
export const PersistUserSettingsToast: FC = () => {
  const persistResult = useAtomValue(persistUserSettingsAtomFn);
  const [dismissedFailure, setDismissedFailure] = useState<unknown>(undefined);
  const open = AsyncResult.isFailure(persistResult) && persistResult.cause !== dismissedFailure;

  const handleClose = () => {
    if (AsyncResult.isFailure(persistResult)) {
      setDismissedFailure(persistResult.cause);
    }
  };

  return (
    <Toast autoHideDuration={6000} onClose={handleClose} open={open} severity="error">
      {PERSIST_FAILURE_MESSAGE}
    </Toast>
  );
};
