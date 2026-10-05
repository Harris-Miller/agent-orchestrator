import { useAtomSet, useAtomValue } from '@effect/atom-react';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import {
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
  const editsDisabled = userSettingsEditsDisabled(settingsResult);

  return (
    <>
      <Typography variant="h6">General</Typography>
      <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
        Session delete confirmation, No Folder group visibility, and Developer mode live in User settings.
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
    </>
  );
};
