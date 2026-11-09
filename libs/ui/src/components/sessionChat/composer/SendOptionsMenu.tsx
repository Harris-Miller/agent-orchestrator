import { useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { ArrowRightLeft, ArrowUp, ChevronDown, GitFork, ListEnd } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { selectedBackendHarnessSnapshotAtom } from '../../../atoms/backendState.atoms.ts';
import type { MidTurnSend } from '../../../atoms/userSettings/userSettings.atoms.ts';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';

/** The Send button's icon for each mid-turn send; the Send options menu item shows the same one. */
export const MID_TURN_SEND_ICON = { queue: ListEnd, steer: ArrowUp } as const;
export const MID_TURN_SEND_LABEL = { queue: 'Queue', steer: 'Steer' } as const;

/**
 * The split chevron button and its menu (other Mid-turn send, Handoff, Fork). Rendered inside the Send button's
 * `ButtonGroup`. `onSubmitDraft` performs only Send or Steering, never Prompt turn cancel (desktop ADR-0018).
 */
export const SendOptionsMenu: FC<{
  readonly onRequestHandoff: () => void;
  readonly onSubmitDraft: (mode?: MidTurnSend) => void;
}> = ({ onRequestHandoff, onSubmitDraft }) => {
  const {
    canForkBase: canFork,
    canHandoffBase: canHandoff,
    composer,
    handoffUnavailableReason,
    isVirtual,
    onClientError,
    requestFork,
    selectedLaunchTarget,
  } = useSessionChatSurface();
  const { action, locked: chromeLocked, midTurnSend } = composer;
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const [splitMenuAnchor, setSplitMenuAnchor] = useState<HTMLElement | null>(null);

  const otherMidTurnSend = midTurnSend === 'queue' ? 'steer' : 'queue';

  return (
    <>
      <Button
        aria-controls={splitMenuAnchor !== null ? 'send-split-menu' : undefined}
        aria-expanded={splitMenuAnchor !== null ? 'true' : undefined}
        aria-haspopup="menu"
        aria-label="Open send options"
        disabled={isVirtual || chromeLocked || selectedLaunchTarget === undefined}
        onClick={event => {
          setSplitMenuAnchor(event.currentTarget);
        }}
        sx={{ minWidth: 36, px: 0.75 }}
      >
        <LucideMuiIcon fontSize="small" icon={ChevronDown} />
      </Button>
      <Menu
        anchorEl={splitMenuAnchor}
        id="send-split-menu"
        onClose={() => {
          setSplitMenuAnchor(null);
        }}
        open={splitMenuAnchor !== null}
      >
        {backendSnapshot?.agentCapabilities.steeringSupported === true ? (
          <MenuItem
            disabled={action._tag !== 'Steer'}
            onClick={() => {
              setSplitMenuAnchor(null);
              onSubmitDraft(otherMidTurnSend);
            }}
          >
            <ListItemIcon>
              <LucideMuiIcon fontSize="small" icon={MID_TURN_SEND_ICON[otherMidTurnSend]} />
            </ListItemIcon>
            <ListItemText>{MID_TURN_SEND_LABEL[otherMidTurnSend]}</ListItemText>
          </MenuItem>
        ) : null}
        <MenuItem
          disabled={!canHandoff}
          onClick={() => {
            setSplitMenuAnchor(null);
            onRequestHandoff();
          }}
        >
          <ListItemIcon>
            <LucideMuiIcon fontSize="small" icon={ArrowRightLeft} />
          </ListItemIcon>
          <ListItemText>Handoff</ListItemText>
          {handoffUnavailableReason === undefined ? null : (
            <Typography color="text.secondary" sx={{ ml: 1 }} variant="caption">
              {handoffUnavailableReason}
            </Typography>
          )}
        </MenuItem>
        <MenuItem
          disabled={!canFork}
          onClick={() => {
            setSplitMenuAnchor(null);
            requestFork()?.catch(onClientError);
          }}
        >
          <ListItemIcon>
            <LucideMuiIcon fontSize="small" icon={GitFork} />
          </ListItemIcon>
          <ListItemText>Fork</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};
