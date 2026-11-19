import { useAtomSet } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { restartBackendAtomFn } from '../atoms/boundHarnessAtoms.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import { isNotSignedIn } from '../host/harnessFailure.ts';
import type { HarnessFailure } from '../host/harnessFailure.ts';
import { writeTextToClipboard } from '../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../theme/tokens.ts';

import { AntigravitySignInControls } from './AntigravitySignInControls.tsx';

export type ProviderPhaseEntry = {
  readonly antigravityAuthUrl: string | undefined;
  readonly failure: HarnessFailure | undefined;
  readonly label: string;
  readonly launchTarget: AgentLaunchTarget;
  readonly phase: AcpBootstrapPhase;
};

const phaseColor = (phase: AcpBootstrapPhase): 'default' | 'error' | 'success' | 'warning' => {
  switch (phase) {
    case 'connecting':
    case 'initialized':
    case 'usable':
    case 'signing-in':
      return 'warning';
    case 'error':
      return 'error';
    case 'ready':
      return 'success';
    default:
      return 'default';
  }
};

/** Phase chip, Antigravity sign-in, and error details for one provider. Shared by Settings → Providers and Provider State. */
export const ProviderPhaseStatus: FC<{ readonly entry: ProviderPhaseEntry }> = ({ entry }) => {
  const restartBackend = useAtomSet(restartBackendAtomFn, { mode: 'promise' });
  const errorText = entry.failure?.message;

  return (
    <Box>
      <Chip
        color={phaseColor(entry.phase)}
        label={`${entry.label}: ${entry.phase}`}
        onClick={
          entry.phase === 'error'
            ? () => {
                restartBackend(entry.launchTarget).catch(() => undefined);
              }
            : undefined
        }
        size="small"
        sx={{ cursor: entry.phase === 'error' ? 'pointer' : 'default' }}
        variant="outlined"
      />
      {entry.launchTarget === 'antigravity-acp' ? (
        <AntigravitySignInControls
          antigravityAuthUrl={entry.antigravityAuthUrl}
          notSignedIn={isNotSignedIn(entry.failure)}
          phase={entry.phase}
        />
      ) : null}
      {errorText !== undefined ? (
        <Accordion
          slotProps={{ transition: { unmountOnExit: true } }}
          sx={{ bgcolor: 'action.hover', borderRadius: 1, mt: 0.75 }}
        >
          <AccordionSummary>
            <Typography component="span" sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }} variant="body2">
              Expand to view error message
            </Typography>
            <Button
              component="span"
              onClick={event => {
                event.stopPropagation();
                hostRunPromise(writeTextToClipboard(errorText)).catch(() => undefined);
              }}
              size="small"
              variant="text"
            >
              copy
            </Button>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box
              component="pre"
              sx={{
                fontFamily: FONT_FAMILY_MONO,
                fontSize: '0.75rem',
                m: 0,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {errorText}
            </Box>
          </AccordionDetails>
        </Accordion>
      ) : null}
    </Box>
  );
};
