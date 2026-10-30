import { useAtomSet } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { signInAntigravityAtomFn } from '../atoms/boundHarnessAtoms.ts';
import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import { ANTIGRAVITY_NOT_SIGNED_IN } from '../host/antigravityAuth.ts';
import { writeTextToClipboard } from '../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../theme/tokens.ts';

type AntigravitySignInControlsProps = {
  readonly authUrl?: string;
  readonly error?: string;
  readonly phase: AcpBootstrapPhase;
};

/** Sign in CTA + auth URL for Antigravity when unsigned or mid Sign in. */
export const AntigravitySignInControls: FC<AntigravitySignInControlsProps> = ({ authUrl, error, phase }) => {
  const signIn = useAtomSet(signInAntigravityAtomFn, { mode: 'promise' });
  const showSignIn = error === ANTIGRAVITY_NOT_SIGNED_IN;
  const signingIn = phase === 'signing-in';

  if (!showSignIn && !signingIn && authUrl === undefined) {
    return null;
  }

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {showSignIn ? (
        <Box>
          <Button
            onClick={() => {
              signIn(undefined).catch(() => undefined);
            }}
            size="small"
            variant="contained"
          >
            Sign in
          </Button>
        </Box>
      ) : null}
      {signingIn ? (
        <Typography color="text.secondary" variant="body2">
          Waiting for Google Sign in. A browser window should open; you can also copy the URL below.
        </Typography>
      ) : null}
      {authUrl !== undefined ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Typography
            component="span"
            sx={{
              flex: 1,
              fontFamily: FONT_FAMILY_MONO,
              fontSize: '0.75rem',
              overflowWrap: 'anywhere',
            }}
            variant="body2"
          >
            {authUrl}
          </Typography>
          <Button
            onClick={() => {
              hostRunPromise(writeTextToClipboard(authUrl)).catch(() => undefined);
            }}
            size="small"
            variant="text"
          >
            Copy
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
};
