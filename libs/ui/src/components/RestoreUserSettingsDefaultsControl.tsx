import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { defaultSettings } from '@lib/ao-home';
import { RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.tsx';
import { Button } from './ui/button.tsx';

/** Restore-defaults button + confirm dialog shared by host Settings shells. */
export const RestoreUserSettingsDefaultsControl: FC = () => {
  const settingsResult = useAtomValue(userSettingsAtom);
  const setUserSettings = useAtomSet(userSettingsAtom);
  const editsDisabled = userSettingsEditsDisabled(settingsResult);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        disabled={editsDisabled}
        onClick={() => {
          setConfirmOpen(true);
        }}
        size="sm"
        variant="outline"
      >
        <RotateCcwIcon />
        Restore defaults
      </Button>
      <AlertDialog
        onOpenChange={open => {
          if (!open) {
            setConfirmOpen(false);
          }
        }}
        open={confirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all preferences to defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores User settings to product defaults. Session usage is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUserSettings(defaultSettings);
                setConfirmOpen(false);
              }}
              variant="destructive"
            >
              Restore defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
