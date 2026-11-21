import type { ElicitationContent } from '@libs/effect-acp';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import type { FC, KeyboardEvent } from 'react';

import { openChatLink } from '../../../host/openChatLink.ts';
import type { ElicitationSummary } from '../../../host/sessionUpdateReducer.ts';
import { hostRunPromise } from '../../../hostRuntime.ts';

import { isOpenableUrl } from './isOpenableUrl.ts';

export const PendingUrlElicitationCard: FC<{
  readonly agentTitle: string;
  readonly message: string;
  readonly onAccept: (content: ElicitationContent, summary: ElicitationSummary) => void;
  readonly onCancel: () => void;
  readonly onDecline: () => void;
  readonly url: string;
}> = ({ agentTitle, message, onAccept, onCancel, onDecline, url }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onCancel();
  };
  return (
    <Paper
      onKeyDown={onKeyDown}
      ref={ref}
      sx={{ bgcolor: 'action.hover', outline: 'none', p: 2 }}
      tabIndex={-1}
      variant="outlined"
    >
      <Typography color="text.secondary" variant="caption">
        {agentTitle} asks
      </Typography>
      <Typography color="text.secondary" gutterBottom variant="body2">
        {message}
      </Typography>
      <Typography
        component="code"
        sx={{ display: 'block', fontFamily: 'monospace', mb: 2, mt: 1, overflowWrap: 'anywhere' }}
        variant="body2"
      >
        {url}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button
          disabled={!isOpenableUrl(url)}
          onClick={() => {
            hostRunPromise(openChatLink({ kind: 'url', url })).catch(() => undefined);
          }}
          size="small"
          variant="outlined"
        >
          Open link
        </Button>
        <Button
          onClick={() => {
            onAccept({}, { message, rows: [] });
          }}
          size="small"
          variant="contained"
        >
          Done
        </Button>
        <Button onClick={onDecline} size="small" variant="outlined">
          Decline
        </Button>
        <Button onClick={onCancel} size="small">
          Cancel
        </Button>
      </Stack>
    </Paper>
  );
};
