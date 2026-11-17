import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { ArrowRightLeft, FolderOpen, GitFork } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { appOrchestratedHandoffEnabledAtom } from '../../../atoms/userSettings/userSettingsDocument.atoms.ts';
import { directoryBasename } from '../../../host/directoryBasename.ts';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';

const CwdLabel: FC = () => {
  const { selectedSession } = useSessionChatSurface();
  const cwd = selectedSession?.cwd;
  return (
    <Box sx={{ alignItems: 'center', display: 'inline-flex', gap: 0.75 }}>
      <LucideMuiIcon icon={FolderOpen} sx={{ fontSize: 14 }} />
      <span>{cwd === undefined ? 'No project' : directoryBasename(cwd)}</span>
    </Box>
  );
};

/**
 * The strip above the Composer: the host's `aboveComposer` (desktop cwd picker) or a read-only cwd label on the left,
 * Fork and Handoff icon buttons pinned right. Always rendered so the layout is stable. Unavailable actions are
 * disabled with a tooltip reason; both are hidden for a Virtual session (nothing to fork).
 */
export const SessionActionsStrip: FC<{
  readonly aboveComposer?: ReactNode;
  readonly onRequestHandoff: () => void;
}> = ({ aboveComposer, onRequestHandoff }) => {
  const {
    canForkBase,
    canHandoffBase,
    forkUnavailableReason,
    handoffUnavailableReason,
    isVirtual,
    onClientError,
    requestFork,
  } = useSessionChatSurface();
  const handoffEnabled = useAtomValue(appOrchestratedHandoffEnabledAtom);

  return (
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
      <Box sx={{ alignItems: 'center', display: 'flex', flexGrow: 1, minWidth: 0 }}>
        {aboveComposer === undefined || aboveComposer === null ? <CwdLabel /> : aboveComposer}
      </Box>
      {isVirtual ? null : (
        <>
          <Tooltip title={forkUnavailableReason ?? 'Fork this session'}>
            <span>
              <IconButton
                aria-label="Fork"
                disabled={!canForkBase}
                onClick={() => {
                  requestFork()?.catch(onClientError);
                }}
                size="small"
              >
                <LucideMuiIcon icon={GitFork} sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          {handoffEnabled ? (
            <Tooltip
              title={
                canHandoffBase
                  ? 'Hand off to another agent'
                  : (handoffUnavailableReason ?? 'Needs a message in the chat')
              }
            >
              <span>
                <IconButton aria-label="Handoff" disabled={!canHandoffBase} onClick={onRequestHandoff} size="small">
                  <LucideMuiIcon icon={ArrowRightLeft} sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </>
      )}
    </Box>
  );
};
