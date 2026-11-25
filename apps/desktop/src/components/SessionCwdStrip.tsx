import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  addProjectAtomFn,
  extraFoldersIgnoredAtom,
  LucideMuiIcon,
  projectDefaultsAtom,
  projectLabel,
  projectOfRecord,
  projectsAtom,
  resolveProject,
  selectedAtom,
  selectedSessionAtom,
  selectVirtualProjectAtomFn,
  VirtualDirectoriesButton,
  virtualMaterializingAtom,
  virtualSessionAtom,
  workspaceFilesAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { CreateSessionDirectoryPicker } from './workbenchNavRail/CreateSessionDirectoryPicker.tsx';

/** Desktop Session cwd strip (tucked by SessionChatBody aboveComposer). Clickable only for Virtual. */
export const SessionCwdStrip: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const selected = useAtomValue(selectedAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const virtual = useAtomValue(virtualSessionAtom);
  const inFlight = useAtomValue(virtualMaterializingAtom);
  const extraFoldersIgnored = useAtomValue(extraFoldersIgnoredAtom);
  const projects = useAtomValue(projectsAtom);
  const workspaceFiles = useAtomValue(workspaceFilesAtom);
  const projectDefaults = useAtomValue(projectDefaultsAtom);
  const selectProject = useAtomSet(selectVirtualProjectAtomFn, { mode: 'promise' });
  const addProject = useAtomSet(addProjectAtomFn, { mode: 'promise' });
  const [pickerOpen, setPickerOpen] = useState(false);

  if (selected === undefined) {
    return null;
  }

  const isVirtual = selected._tag === 'Virtual';
  const record = isVirtual ? virtual : selectedSession;
  const cwd = record?.cwd;
  // A session in a Workspace project reads as that Project (the cwd is its first folder), else as its cwd.
  const label =
    cwd === undefined ? 'Choose Project' : projectLabel(projectOfRecord({ ...record, cwd }, projects) ?? cwd);
  const canPick = isVirtual && !inFlight;
  // What "Reset" in the directories editor goes back to: the Project's folders and defaults.
  const draftProject = cwd === undefined ? undefined : (projectOfRecord({ ...record, cwd }, projects) ?? cwd);
  const resolved =
    draftProject === undefined ? undefined : resolveProject(draftProject, workspaceFiles, projectDefaults);
  const projectDirectories = resolved?._tag === 'Ready' ? resolved.additionalDirectories : [];

  return (
    <>
      <Box
        component={canPick ? 'button' : 'div'}
        disabled={canPick ? false : undefined}
        onClick={
          canPick
            ? () => {
                setPickerOpen(true);
              }
            : undefined
        }
        sx={{
          '&:disabled': { opacity: 0.5 },
          '&:hover:not(:disabled)': canPick ? { color: 'text.primary' } : undefined,
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: canPick ? 'pointer' : 'default',
          display: 'inline-flex',
          font: 'inherit',
          fontSize: 12,
          gap: 0.75,
          opacity: isVirtual && inFlight ? 0.5 : 1,
          p: 0,
        }}
        type={canPick ? 'button' : undefined}
      >
        <LucideMuiIcon icon={FolderOpen} sx={{ fontSize: 14 }} />
        <span>{label}</span>
        {extraFoldersIgnored ? (
          <Tooltip title="This agent does not support additional directories, so only the first folder is used.">
            <Box component="span" sx={{ color: 'warning.main', fontSize: 11 }}>
              extra folders ignored
            </Box>
          </Tooltip>
        ) : null}
      </Box>
      {isVirtual ? <VirtualDirectoriesButton defaults={projectDirectories} onClientError={onClientError} /> : null}
      {pickerOpen && isVirtual ? (
        <CreateSessionDirectoryPicker
          confirmLabel="Select"
          onClose={() => {
            setPickerOpen(false);
          }}
          onSelectDirectory={nextCwd => {
            addProject(nextCwd)
              .then(() => selectProject(nextCwd))
              .catch(onClientError);
          }}
        />
      ) : null}
    </>
  );
};
