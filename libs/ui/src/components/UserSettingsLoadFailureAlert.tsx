import { useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import type { SxProps, Theme } from '@mui/material/styles';
import { Cause } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import type { FC } from 'react';

import { userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';

/** Inline Alert when User settings failed to load (host shells place near pane content). */
export const UserSettingsLoadFailureAlert: FC<{ readonly sx?: SxProps<Theme> }> = ({ sx }) => {
  const settingsResult = useAtomValue(userSettingsAtom);
  if (!AsyncResult.isFailure(settingsResult)) {
    return null;
  }
  return (
    <Alert severity="error" sx={sx}>
      {Cause.pretty(settingsResult.cause)}
    </Alert>
  );
};
