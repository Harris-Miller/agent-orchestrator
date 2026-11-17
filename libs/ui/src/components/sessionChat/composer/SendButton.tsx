import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { ArrowUp, ListEnd, Square } from 'lucide-react';
import type { FC } from 'react';

import type { MidTurnSend } from '../../../atoms/userSettings/userSettings.atoms.ts';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';

/** The Send button's icon and label for each mid-turn send; the other-mode button shows the same ones. */
const MID_TURN_SEND_ICON = { queue: ListEnd, steer: ArrowUp } as const;
const MID_TURN_SEND_LABEL = { queue: 'Queue', steer: 'Steer' } as const;

/**
 * The primary button (the Composer action). While the Composer action is Steer, a small outlined button for the other
 * Mid-turn send (Queue or Steer) sits to its left. `onSubmitDraft` (Enter, editor submit, the other-mode button)
 * performs only Send or Steering, never Prompt turn cancel (desktop ADR-0018). Prompt turn cancel happens only when
 * the Composer action is CancelTurn: this button's CancelTurn arm (type="button", calls `onCancelPrompt`) and the
 * Composer form's onSubmit, which routes CancelTurn to the same callback.
 */
export const SendButton: FC<{
  readonly onCancelPrompt: () => void;
  readonly onSubmitDraft: (mode?: MidTurnSend) => void;
}> = ({ onCancelPrompt, onSubmitDraft }) => {
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
  const otherMidTurnSend = midTurnSend === 'queue' ? 'steer' : 'queue';

  return (
    <>
      {action._tag === 'Steer' ? (
        <Button
          onClick={() => {
            onSubmitDraft(otherMidTurnSend);
          }}
          size="small"
          startIcon={<LucideMuiIcon fontSize="small" icon={MID_TURN_SEND_ICON[otherMidTurnSend]} />}
          type="button"
          variant="outlined"
        >
          {MID_TURN_SEND_LABEL[otherMidTurnSend]}
        </Button>
      ) : null}
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
        variant="contained"
      >
        {action._tag === 'CancelTurn' ? (
          <LucideMuiIcon fontSize="small" icon={Square} />
        ) : sendPending ? (
          <CircularProgress color="inherit" size={18} />
        ) : (
          <LucideMuiIcon fontSize="small" icon={action._tag === 'Steer' ? MID_TURN_SEND_ICON[midTurnSend] : ArrowUp} />
        )}
      </Button>
    </>
  );
};
