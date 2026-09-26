import { useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useState } from 'react';
import type { FC } from 'react';

import { persistUserSettingsAtomFn } from '../atoms/userSettings/userSettings.atoms.ts';

const PERSIST_FAILURE_MESSAGE = 'Failed to save User Settings to disk.';

/** Root toast when User settings persist fails (memory stays Success). */
export const PersistUserSettingsToast: FC = () => {
  const persistResult = useAtomValue(persistUserSettingsAtomFn);
  const [dismissedFailure, setDismissedFailure] = useState<unknown>(undefined);
  const open = AsyncResult.isFailure(persistResult) && persistResult.cause !== dismissedFailure;

  return (
    <Snackbar
      anchorOrigin={{ horizontal: 'center', vertical: 'bottom' }}
      autoHideDuration={6000}
      onClose={() => {
        if (AsyncResult.isFailure(persistResult)) {
          setDismissedFailure(persistResult.cause);
        }
      }}
      open={open}
    >
      <Alert
        onClose={() => {
          if (AsyncResult.isFailure(persistResult)) {
            setDismissedFailure(persistResult.cause);
          }
        }}
        severity="error"
        sx={{ width: '100%' }}
        variant="filled"
      >
        {PERSIST_FAILURE_MESSAGE}
      </Alert>
    </Snackbar>
  );
};
