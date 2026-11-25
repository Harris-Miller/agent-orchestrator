import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { FC } from 'react';

import { backendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import { setSessionDirectoriesAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { resolveSessionDirectories } from '../../host/sessionDirectories.ts';
import { AdditionalDirectoriesDialog } from '../AdditionalDirectoriesDialog.tsx';

/**
 * A session's directories: its Session cwd and Workspace file (read-only: the cwd is the session's identity) and its
 * Additional directories, editable. The edit changes the Tracked session and applies the next time the session is
 * activated; an open session is not touched (desktop ADR 0024).
 */
export const SessionDirectoriesDialog: FC<{
  readonly entry: UnifiedHistoryEntry;
  readonly onClientError: (error: unknown) => void;
  readonly onClose: () => void;
}> = ({ entry, onClientError, onClose }) => {
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(entry.launchTarget));
  const setDirectories = useAtomSet(setSessionDirectoriesAtomFn, { mode: 'promise' });
  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const open = session !== undefined && session.status !== 'inactive';
  const current = resolveSessionDirectories(session, entry);
  const followsFile = entry.workspaceFile !== undefined && entry.directoriesEdited !== true;

  return (
    <AdditionalDirectoriesDialog
      description={`${
        open
          ? 'This session is open and keeps its directories. Changes apply the next time it is activated.'
          : 'Changes apply the next time this session is activated.'
      }${followsFile ? ' Once changed, the list no longer follows the workspace file.' : ''}`}
      facts={[
        { label: 'Session cwd', value: entry.cwd },
        ...(entry.workspaceFile === undefined ? [] : [{ label: 'Workspace file', value: entry.workspaceFile }]),
      ]}
      initial={current.additionalDirectories ?? []}
      onClose={onClose}
      onSave={directories => {
        setDirectories({
          directories,
          launchTarget: entry.launchTarget,
          sessionId: entry.sessionId,
        }).catch(onClientError);
      }}
      title="Session directories"
    />
  );
};
