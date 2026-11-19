import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { ChatItemOf } from './chatItemOf.ts';

/** What each action does; an action without a handler (or hint) is not shown. */
export type SessionFailureHandlers = {
  /** `login`: a sign-in button, or a caption hint when the provider signs in outside the app. */
  readonly login?: { readonly hint: string; readonly onSignIn?: () => void };
  readonly onNewSession?: () => void;
  readonly onRetry?: () => void;
};

export const SessionFailureView: FC<{
  readonly handlers?: SessionFailureHandlers;
  readonly item: ChatItemOf<'session_failure'>;
}> = ({ handlers = {}, item }) => {
  const { login, onNewSession, onRetry } = handlers;
  const showRetry = item.actions.includes('retry') && onRetry !== undefined;
  const showLogin = item.actions.includes('login') && login !== undefined;
  const showNewSession = item.actions.includes('new_session') && onNewSession !== undefined;
  const hasButtons = showRetry || showNewSession || (showLogin && login.onSignIn !== undefined);
  return (
    <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
      <Alert
        action={
          hasButtons ? (
            <Stack direction="row" spacing={1}>
              {showRetry ? (
                <Button color="inherit" onClick={onRetry} size="small">
                  Retry
                </Button>
              ) : null}
              {showLogin && login.onSignIn !== undefined ? (
                <Button color="inherit" onClick={login.onSignIn} size="small">
                  Sign in
                </Button>
              ) : null}
              {showNewSession ? (
                <Button color="inherit" onClick={onNewSession} size="small">
                  New session
                </Button>
              ) : null}
            </Stack>
          ) : undefined
        }
        severity={item.severity}
        variant="outlined"
      >
        <AlertTitle>{item.title}</AlertTitle>
        {item.reason}
        {item.details === undefined ? null : (
          <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="body2">
            {item.details}
          </Typography>
        )}
        {showLogin && login.onSignIn === undefined ? (
          <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="caption">
            {login.hint}
          </Typography>
        ) : null}
      </Alert>
    </ListItem>
  );
};
