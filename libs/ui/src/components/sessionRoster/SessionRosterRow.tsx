import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { ArchiveIcon, EllipsisIcon, Trash2Icon } from 'lucide-react';
import type { FC } from 'react';

import { backendHarnessStateAtom } from '../../atoms/backendState.atoms.ts';
import { activateSessionAtomFn, archiveSessionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { hasSessionArchiveCapability } from '../../host/acpSessionBootstrap.ts';
import type { UnifiedRosterEntry } from '../../host/acpSessionBootstrap.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { Button } from '../ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';
import { Spinner } from '../ui/spinner.tsx';

import { noopClientError } from './noopClientError.ts';

export const SessionRosterRow: FC<{
  readonly entry: UnifiedRosterEntry;
  readonly onClientError?: (error: unknown) => void;
  readonly onDeleteRequest: (entry: UnifiedRosterEntry) => void;
  readonly selected: boolean;
}> = ({ entry, onClientError = noopClientError, onDeleteRequest, selected }) => {
  const snapshot = useAtomValue(backendHarnessStateAtom(entry.launchTarget));
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const archiveSession = useAtomSet(archiveSessionAtomFn, { mode: 'promise' });

  const session = entry.sessionId in snapshot.sessions ? snapshot.sessions[entry.sessionId] : undefined;
  const pendingClientRequest = session?.pendingClientRequest !== undefined;
  const displayTitle = entry.title ?? 'New Session';

  const activateRosterEntry = () => {
    // activateSession selects + no-ops when already active/activating (Codex-safe).
    activateSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(onClientError);
  };

  return (
    <div className="px-2 py-1.5">
      <div
        className={
          selected
            ? 'w-full cursor-pointer overflow-hidden rounded-md border border-primary bg-accent hover:bg-muted'
            : 'w-full cursor-pointer overflow-hidden rounded-md border border-border bg-card hover:bg-muted'
        }
        onClick={activateRosterEntry}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activateRosterEntry();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-1 px-3 py-2.5">
          <AgentLaunchTargetIcon launchTarget={entry.launchTarget} />
          <div className="min-w-0 flex-1">
            <p
              className={
                selected
                  ? 'line-clamp-2 w-full text-sm leading-snug font-semibold'
                  : 'line-clamp-2 w-full text-sm leading-snug'
              }
            >
              {displayTitle}
            </p>
          </div>
          {pendingClientRequest ? <Spinner aria-label="Pending client request" className="size-3.5 shrink-0" /> : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Session actions"
                  className="shrink-0"
                  onClick={event => {
                    event.stopPropagation();
                  }}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasSessionArchiveCapability(snapshot.initializeResult) ? (
                <DropdownMenuItem
                  onClick={() => {
                    archiveSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId }).catch(
                      onClientError,
                    );
                  }}
                >
                  <ArchiveIcon />
                  Archive
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() => {
                  onDeleteRequest(entry);
                }}
                variant="destructive"
              >
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
