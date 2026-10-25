import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { NavSessionGroup, UnifiedRosterEntry } from '@lib/ui';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ConfirmSessionDeleteDialog,
  ensureVirtualSessionAtomFn,
  groupAndSortSessionsForNav,
  navSessionGroupStableKey,
  refreshAllSessionRostersAtomFn,
  selectedSessionIdAtom,
  SessionRosterRow,
  showNoFolderGroupAtom,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  unifiedSessionRosterAtom,
  useSessionDeleteRequest,
} from '@lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { FolderIcon, FolderOpenIcon, PlusIcon, RotateCwIcon, SettingsIcon } from 'lucide-react';
import type { FC } from 'react';

import { directoryBasename } from '../../directoryBasename.ts';

export const WORKBENCH_NAV_RAIL_WIDTH = 320;

const NO_FOLDER_TOOLTIP = 'Projectless / scratch sessions';

type NavGroupPresentation = {
  readonly createCwd: string | undefined;
  readonly key: string;
  readonly label: string;
  readonly tooltip: string;
};

const navGroupPresentation = (group: NavSessionGroup<UnifiedRosterEntry>): NavGroupPresentation => {
  if (group.kind === 'cwd') {
    return {
      createCwd: group.cwd,
      key: navSessionGroupStableKey(group),
      label: directoryBasename(group.cwd),
      tooltip: group.cwd,
    };
  }
  return {
    createCwd: undefined,
    key: navSessionGroupStableKey(group),
    label: 'No Folder',
    tooltip: NO_FOLDER_TOOLTIP,
  };
};

export const WorkbenchNavRail: FC<{
  readonly onClose: () => void;
}> = ({ onClose }) => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const showNoFolderGroup = useAtomValue(showNoFolderGroupAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest();
  const navigate = useNavigate();

  const navGroups = groupAndSortSessionsForNav(roster).filter(group => group.kind !== 'noFolder' || showNoFolderGroup);

  return (
    <>
      <div className="box-border flex h-full min-h-0 flex-col bg-card">
        <div className="flex min-h-[49px] shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="text-lg font-medium">Sessions</h2>
            <Button
              aria-label="Reload sessions"
              onClick={() => {
                refreshAllSessionRosters(undefined).catch(() => undefined);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <RotateCwIcon />
            </Button>
          </div>
          <Button aria-label="Close session roster panel" onClick={onClose} size="icon-sm" variant="ghost">
            ‹
          </Button>
        </div>
        <div className="shrink-0 p-4">
          <Button
            className="w-full"
            onClick={() => {
              ensureVirtualSession(undefined).catch(() => undefined);
            }}
          >
            Create New Session
          </Button>
        </div>
        <div className="h-px bg-border" />
        <div className="min-h-0 flex-1 overflow-auto">
          {roster.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No sessions yet. Create one to get started.</p>
          ) : (
            <div className="py-1">
              {navGroups.map(group => {
                const presentation = navGroupPresentation(group);
                const createCwdForGroup = presentation.createCwd;
                return (
                  <Accordion defaultValue={[presentation.key]} key={presentation.key}>
                    <AccordionItem className="border-0" value={presentation.key}>
                      <AccordionTrigger className="px-4 py-2 hover:bg-muted hover:no-underline **:data-[slot=accordion-trigger-icon]:hidden">
                        <FolderIcon className="size-4 shrink-0 group-aria-expanded/accordion-trigger:hidden" />
                        <FolderOpenIcon className="hidden size-4 shrink-0 group-aria-expanded/accordion-trigger:inline" />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={<span className="min-w-0 flex-1 text-left wrap-anywhere whitespace-normal" />}
                            >
                              {presentation.label}
                            </TooltipTrigger>
                            <TooltipContent>{presentation.tooltip}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {createCwdForGroup !== undefined ? (
                          <span
                            aria-label={`Create session in ${presentation.label}`}
                            className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-background"
                            onClick={event => {
                              event.preventDefault();
                              event.stopPropagation();
                              ensureVirtualSession({
                                cwd: createCwdForGroup,
                                patchCwdIfSelectedVirtual: true,
                              }).catch(() => undefined);
                            }}
                            onKeyDown={event => {
                              if (event.key !== 'Enter' && event.key !== ' ') {
                                return;
                              }
                              event.preventDefault();
                              event.stopPropagation();
                              ensureVirtualSession({
                                cwd: createCwdForGroup,
                                patchCwdIfSelectedVirtual: true,
                              }).catch(() => undefined);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <PlusIcon className="size-4" />
                          </span>
                        ) : null}
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
                        {group.sessions.map(entry => (
                          <SessionRosterRow
                            entry={entry}
                            key={`${entry.launchTarget}:${entry.sessionId}`}
                            onDeleteRequest={requestDelete}
                            selected={selectedSessionId === entry.sessionId}
                          />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                );
              })}
            </div>
          )}
        </div>
        <div className="h-px bg-border" />
        <div className="shrink-0 p-2">
          <Button
            className="w-full justify-start"
            onClick={() => {
              navigate({ params: { category: 'general' }, to: '/settings/$category' }).catch(() => undefined);
            }}
            variant="ghost"
          >
            <SettingsIcon />
            Settings
          </Button>
        </div>
      </div>

      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} target={deleteTarget} />
    </>
  );
};
