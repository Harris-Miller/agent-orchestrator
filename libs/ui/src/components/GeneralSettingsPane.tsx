import { useAtomSet, useAtomValue } from '@effect/atom-react';
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

import { SettingsSectionIntro } from './settingsChrome.tsx';
import { Switch } from './ui/switch.tsx';

const SettingSwitch: FC<{
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly onCheckedChange: (checked: boolean) => void;
}> = ({ checked, disabled, id, label, onCheckedChange }) => (
  <div className="flex items-center gap-2 text-sm">
    <Switch aria-labelledby={`${id}-label`} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    <span id={`${id}-label`}>{label}</span>
  </div>
);

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
      <SettingsSectionIntro title="General">
        Session delete confirmation, No Folder group visibility, Developer mode, and Always-hidden globs live in User
        settings.
      </SettingsSectionIntro>
      <div className="flex flex-col gap-2">
        <SettingSwitch
          checked={confirmSessionDelete}
          disabled={editsDisabled}
          id="confirm-session-delete"
          label="Confirm before deleting a session"
          onCheckedChange={setConfirmSessionDelete}
        />
        <SettingSwitch
          checked={showNoFolderGroup}
          disabled={editsDisabled}
          id="show-no-folder-group"
          label="Show No Folder group in Sessions"
          onCheckedChange={setShowNoFolderGroup}
        />
        <SettingSwitch
          checked={developerMode}
          disabled={editsDisabled}
          id="developer-mode"
          label="Developer mode"
          onCheckedChange={setDeveloperMode}
        />
      </div>
      <span className="mt-4 block text-sm font-medium" id="always-hidden-globs-label">
        Always-hidden globs
      </span>
      <textarea
        aria-labelledby="always-hidden-globs-label"
        className="mt-1.5 block min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        disabled={editsDisabled}
        onBlur={() => {
          setAlwaysHiddenGlobs(alwaysHiddenGlobsText.split('\n'));
          setAlwaysHiddenGlobsDraft(undefined);
        }}
        onChange={event => {
          setAlwaysHiddenGlobsDraft(event.target.value);
        }}
        value={alwaysHiddenGlobsText}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        One Always-hidden glob per line. Always applied to the New Session directory picker and composer @ mentions,
        including when Show hidden is on. .git is always excluded.
      </p>
    </>
  );
};
