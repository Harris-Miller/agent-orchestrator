import { useAtomSet } from '@effect/atom-react';
import type { FC } from 'react';

import { deleteSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import type { UnifiedRosterEntry } from '../../host/acpSessionBootstrap.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog.tsx';

import { noopClientError } from './noopClientError.ts';
import { truncateSessionId } from './truncateSessionId.ts';

export const ConfirmSessionDeleteDialog: FC<{
  readonly onCancel: () => void;
  readonly onClientError?: (error: unknown) => void;
  readonly target: undefined | UnifiedRosterEntry;
}> = ({ onCancel, onClientError = noopClientError, target }) => {
  const deleteSession = useAtomSet(deleteSessionAtomFn, { mode: 'promise' });

  return (
    <AlertDialog
      onOpenChange={open => {
        if (!open) {
          onCancel();
        }
      }}
      open={target !== undefined}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete session?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete session{' '}
            <span className="font-mono">{target !== undefined ? truncateSessionId(target.sessionId) : ''}</span>. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (target === undefined) {
                return;
              }
              const { launchTarget, sessionId } = target;
              deleteSession({ launchTarget, sessionId }).then(onCancel).catch(onClientError);
            }}
            variant="destructive"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
