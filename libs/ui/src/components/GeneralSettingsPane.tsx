import { useAtomSet, useAtomValue } from '@effect/atom-react';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import {
  alwaysHiddenGlobsAtom,
  confirmSessionDeleteAtom,
  developerModeAtom,
  showNoFolderGroupAtom,
  userSettingsAtom,
} from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';

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
        sx={{ ml: 0 }}
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
        sx={{ display: 'block', ml: 0, mt: 1 }}
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
        sx={{ display: 'block', ml: 0, mt: 1 }}
      />
      <TextField
        disabled={editsDisabled}
        fullWidth
        helperText="One Always-hidden glob per line. Always applied to the New Session directory picker and composer @ mentions, including when Show hidden is on. .git is always excluded."
        label="Always-hidden globs"
        minRows={3}
        multiline
        onChange={event => {
          setAlwaysHiddenGlobs(event.target.value.split('\n'));
        }}
        sx={{ display: 'block', mt: 2 }}
        value={alwaysHiddenGlobs.join('\n')}
      />
    </>
  );
};
