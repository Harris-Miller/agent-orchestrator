import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { defaultSettings } from '@lib/hoa-home';
import Box from '@mui/material/Box';
import { IconTooltipButton } from './IconTooltipButton.tsx';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';

import { LucideMuiIcon } from './LucideMuiIcon.tsx';

/** Restore-defaults button + confirm dialog shared by host Settings shells. */
export const RestoreUserSettingsDefaultsControl: FC<{
  readonly iconFontSize?: 'inherit' | 'large' | 'medium' | 'small';
}> = ({ iconFontSize }) => {
  const settingsResult = useAtomValue(userSettingsAtom);
  const setUserSettings = useAtomSet(userSettingsAtom);
  const editsDisabled = userSettingsEditsDisabled(settingsResult);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Box sx={theme => ({ display: 'none', [theme.breakpoints.up('md')]: { display: 'block' } })}>
        <Button
          disabled={editsDisabled}
          onClick={() => {
            setConfirmOpen(true);
          }}
          size="small"
          startIcon={<LucideMuiIcon fontSize={iconFontSize} icon={RotateCcw} />}
        >
          Restore defaults
        </Button>
      </Box>
      <Box sx={theme => ({ display: 'block', [theme.breakpoints.up('md')]: { display: 'none' } })}>
        <IconTooltipButton
          disabled={editsDisabled}
          icon={RotateCcw}
          label="Restore defaults"
          onClick={() => {
            setConfirmOpen(true);
          }}
        />
      </Box>
      <Dialog
        onClose={() => {
          setConfirmOpen(false);
        }}
        open={confirmOpen}
      >
        <DialogTitle>Reset all preferences to defaults?</DialogTitle>
        <DialogContent>
          <DialogContentText>This restores User settings to product defaults.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirmOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            onClick={() => {
              setUserSettings(defaultSettings);
              setConfirmOpen(false);
            }}
            variant="contained"
          >
            Restore defaults
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
