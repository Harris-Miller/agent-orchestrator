import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import { ArrowUp, Square } from 'lucide-react';
import type { FC } from 'react';

import type { MidTurnSend } from '../../../atoms/userSettings/userSettings.atoms.ts';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';
import { MID_TURN_SEND_ICON, MID_TURN_SEND_LABEL, SendOptionsMenu } from './SendOptionsMenu.tsx';

/**
 * The primary button (the Composer action) plus the Send options split menu (other Mid-turn send, Handoff, Fork).
 * `onSubmitDraft` (Enter, editor submit, the Send options menu) performs only Send or Steering, never Prompt turn
 * cancel (desktop ADR-0018). Prompt turn cancel happens only when the Composer action is CancelTurn: this button's
 * CancelTurn arm (type="button", calls `onCancelPrompt`) and the Composer form's onSubmit, which routes CancelTurn
 * to the same callback.
 */
export const SendButton: FC<{
  readonly onCancelPrompt: () => void;
  readonly onRequestHandoff: () => void;
  readonly onSubmitDraft: (mode?: MidTurnSend) => void;
}> = ({ onCancelPrompt, onRequestHandoff, onSubmitDraft }) => {
  const { composer } = useSessionChatSurface();
  const { action, midTurnSend } = composer;

  const sendPending =
    action._tag === 'Unavailable' && (action.reason === 'PendingClientRequest' || action.reason === 'SendPending');
  const primaryButton =
    action._tag === 'CancelTurn'
      ? { ariaLabel: 'Prompt turn cancel', disabled: false }
      : action._tag === 'Steer'
        ? { ariaLabel: MID_TURN_SEND_LABEL[midTurnSend], disabled: false }
        : { ariaLabel: sendPending ? 'Pending client request' : 'Send', disabled: action._tag !== 'Send' };

  return (
    <ButtonGroup variant="contained">
      <Button
        aria-label={primaryButton.ariaLabel}
        disabled={primaryButton.disabled}
        title={primaryButton.ariaLabel}
        onClick={
          action._tag === 'CancelTurn'
            ? event => {
                event.preventDefault();
                onCancelPrompt();
              }
            : undefined
        }
        sx={{ minWidth: 40, px: 1.5 }}
        type={action._tag === 'CancelTurn' ? 'button' : 'submit'}
      >
        {action._tag === 'CancelTurn' ? (
          <LucideMuiIcon fontSize="small" icon={Square} />
        ) : sendPending ? (
          <CircularProgress color="inherit" size={18} />
        ) : (
          <LucideMuiIcon fontSize="small" icon={action._tag === 'Steer' ? MID_TURN_SEND_ICON[midTurnSend] : ArrowUp} />
        )}
      </Button>
      <SendOptionsMenu onRequestHandoff={onRequestHandoff} onSubmitDraft={onSubmitDraft} />
    </ButtonGroup>
  );
};
