import { useAtomValue } from '@effect/atom-react';
import { Cause } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { FC } from 'react';

import { userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';

import { Alert, AlertDescription } from './ui/alert.tsx';

/** Inline Alert when User settings failed to load (host shells place near pane content). */
export const UserSettingsLoadFailureAlert: FC<{ readonly className?: string }> = ({ className }) => {
  const settingsResult = useAtomValue(userSettingsAtom);
  if (!AsyncResult.isFailure(settingsResult)) {
    return null;
  }
  return (
    <Alert className={className} variant="destructive">
      <AlertDescription>{Cause.pretty(settingsResult.cause)}</AlertDescription>
    </Alert>
  );
};
