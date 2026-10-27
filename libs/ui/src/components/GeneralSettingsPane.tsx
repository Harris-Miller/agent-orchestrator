import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import {
  alwaysHiddenGlobsAtom,
  confirmSessionDeleteAtom,
  developerModeAtom,
  showNoFolderGroupAtom,
  userSettingsAtom,
} from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';

import { FieldLabel } from './FieldLabel.tsx';

/** Settings → General: User settings toggles shared across hosts. */
export const GeneralSettingsPane: FC = () => {
  const settingsResult = useAtomValue(userSettingsAtom);
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const setConfirmSessionDelete = useAtomSet(confirmSessionDeleteAtom);
  const developerMode = useAtomValue(developerModeAtom);
  const setDeveloperMode = useAtomSet(developerModeAtom);
  const showNoFolderGroup = useAtomValue(showNoFolderGroupAtom);
  const setShowNoFolderGroup = useAtomSet(showNoFolderGroupAtom);
  const alwaysHiddenGlobs = useAtomValue(alwaysHiddenGlobsAtom);
  const setAlwaysHiddenGlobs = useAtomSet(alwaysHiddenGlobsAtom);
  /** Draft text so Enter can open a new line; atom normalize runs on blur. */
  const [alwaysHiddenGlobsDraft, setAlwaysHiddenGlobsDraft] = useState<string | undefined>(undefined);
  const alwaysHiddenGlobsText = alwaysHiddenGlobsDraft ?? alwaysHiddenGlobs.join('\n');
  const editsDisabled = userSettingsEditsDisabled(settingsResult);

  return (
    <>
      <Typography variant="h6">General</Typography>
      <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
        Session delete confirmation, No Folder group visibility, Developer mode, and Always-hidden globs live in User
        settings.
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={confirmSessionDelete}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setConfirmSessionDelete(checked);
            }}
          />
        }
        label="Confirm before deleting a session"
      />
      <FormControlLabel
        control={
          <Switch
            checked={showNoFolderGroup}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setShowNoFolderGroup(checked);
            }}
          />
        }
        label="Show No Folder group in Sessions"
        sx={{ display: 'block', mt: 1 }}
      />
      <FormControlLabel
        control={
          <Switch
            checked={developerMode}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setDeveloperMode(checked);
            }}
          />
        }
        label="Developer mode"
        sx={{ display: 'block', mt: 1 }}
      />
      <Box sx={{ mt: 2 }}>
        <FieldLabel fullWidth htmlFor="always-hidden-globs" label="Always-hidden globs">
          <TextField
            disabled={editsDisabled}
            fullWidth
            helperText="One Always-hidden glob per line. Always applied to the New Session directory picker and composer @ mentions, including when Show hidden is on. .git is always excluded."
            id="always-hidden-globs"
            minRows={3}
            multiline
            onBlur={() => {
              setAlwaysHiddenGlobs(alwaysHiddenGlobsText.split('\n'));
              setAlwaysHiddenGlobsDraft(undefined);
            }}
            onChange={event => {
              setAlwaysHiddenGlobsDraft(event.target.value);
            }}
            value={alwaysHiddenGlobsText}
          />
        </FieldLabel>
      </Box>
    </>
  );
};
