import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { LucideMuiIcon } from '../../../LucideMuiIcon.tsx';
import { DisclosureButton, DisclosureChevron } from '../DisclosureButton.tsx';

import type { ChatItemOf } from './chatItemOf.ts';

/** What each action does; an action without a handler (or hint) is not shown. */
export type SessionFailureHandlers = {
  /** `login`: a sign-in button, or a caption hint when the provider signs in outside the app. */
  readonly login?: { readonly hint: string; readonly onSignIn?: () => void };
  readonly onNewSession?: () => void;
  readonly onRetry?: () => void;
};

/** A Work item row, collapsed to its title; expanding reveals reason, details and actions. */
export const SessionFailureView: FC<{
  readonly handlers?: SessionFailureHandlers;
  readonly item: ChatItemOf<'session_failure'>;
}> = ({ handlers = {}, item }) => {
  const [open, setOpen] = useState(false);
  const { login, onNewSession, onRetry } = handlers;
  const showRetry = item.actions.includes('retry') && onRetry !== undefined;
  const showLogin = item.actions.includes('login') && login !== undefined;
  const showNewSession = item.actions.includes('new_session') && onNewSession !== undefined;
  const hasButtons = showRetry || showNewSession || (showLogin && login.onSignIn !== undefined);
  return (
    <ListItem sx={{ alignItems: 'flex-start', display: 'block', py: 0 }}>
      <DisclosureButton
        onToggle={() => {
          setOpen(current => !current);
        }}
        open={open}
        sx={{ alignItems: 'center', color: 'inherit', gap: 1, px: 0.5, py: 0.25, width: '100%' }}
      >
        <LucideMuiIcon
          aria-label={item.severity}
          icon={TriangleAlert}
          sx={{ color: item.severity === 'error' ? 'error.main' : 'warning.main', fontSize: 16 }}
        />
        <Typography noWrap sx={{ flex: 1, textAlign: 'left' }} variant="body2">
          {item.title}
        </Typography>
        <DisclosureChevron open={open} />
      </DisclosureButton>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.5} sx={{ pl: 3.5, pt: 0.5 }}>
          {item.reason === undefined ? null : (
            <Typography color="text.secondary" variant="body2">
              {item.reason}
            </Typography>
          )}
          {item.details === undefined ? null : (
            <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }} variant="body2">
              {item.details}
            </Typography>
          )}
          {showLogin && login.onSignIn === undefined ? (
            <Typography color="text.secondary" variant="caption">
              {login.hint}
            </Typography>
          ) : null}
          {hasButtons ? (
            <Box>
              <Stack direction="row" spacing={1}>
                {showRetry ? (
                  <Button onClick={onRetry} size="small">
                    Retry
                  </Button>
                ) : null}
                {showLogin && login.onSignIn !== undefined ? (
                  <Button onClick={login.onSignIn} size="small">
                    Sign in
                  </Button>
                ) : null}
                {showNewSession ? (
                  <Button onClick={onNewSession} size="small">
                    New session
                  </Button>
                ) : null}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </Collapse>
    </ListItem>
  );
};
