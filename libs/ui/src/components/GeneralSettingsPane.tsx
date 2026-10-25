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

import { Switch } from './ui/switch.tsx';

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
      <h2 className="text-lg font-medium">General</h2>
      <p className="mt-2 mb-4 text-sm text-muted-foreground">
        Session delete confirmation, No Folder group visibility, Developer mode, and Always-hidden globs live in User
        settings.
      </p>
      <div className="flex items-center gap-2 text-sm">
        <Switch
          aria-labelledby="confirm-session-delete-label"
          checked={confirmSessionDelete}
          disabled={editsDisabled}
          onCheckedChange={setConfirmSessionDelete}
        />
        <span id="confirm-session-delete-label">Confirm before deleting a session</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <Switch
          aria-labelledby="show-no-folder-group-label"
          checked={showNoFolderGroup}
          disabled={editsDisabled}
          onCheckedChange={setShowNoFolderGroup}
        />
        <span id="show-no-folder-group-label">Show No Folder group in Sessions</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <Switch
          aria-labelledby="developer-mode-label"
          checked={developerMode}
          disabled={editsDisabled}
          onCheckedChange={setDeveloperMode}
        />
        <span id="developer-mode-label">Developer mode</span>
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
