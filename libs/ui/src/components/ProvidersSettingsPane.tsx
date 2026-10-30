import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { allLaunchTargetPhasesAtom } from '../atoms/backendState.atoms.ts';
import { restartBackendAtomFn } from '../atoms/boundHarnessAtoms.ts';
import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import { writeTextToClipboard } from '../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../theme/tokens.ts';

import { AntigravitySignInControls } from './AntigravitySignInControls.tsx';

const phaseColor = (phase: AcpBootstrapPhase): 'default' | 'error' | 'success' | 'warning' => {
  switch (phase) {
    case 'connecting':
    case 'initialized':
    case 'probing':
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

const prettyErrorText = (error: string): string => {
  try {
    return JSON.stringify(JSON.parse(error), null, 2);
  } catch {
    return error;
  }
};

/** Settings → Providers: harness phase chips. */
export const ProvidersSettingsPane: FC = () => {
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const restartBackend = useAtomSet(restartBackendAtomFn, { mode: 'promise' });

  return (
    <>
      <Typography variant="h6">Providers</Typography>
      <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
        Bootstrap phase per provider. Click an error chip to retry that provider.
      </Typography>
      <Stack spacing={2}>
        {backendPhases.map(entry => {
          const errorText = entry.error === undefined ? undefined : prettyErrorText(entry.error);
          return (
            <Box key={entry.launchTarget}>
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
                  error={entry.error}
                  phase={entry.phase}
                />
              ) : null}
              {errorText !== undefined ? (
                <Accordion sx={{ bgcolor: 'action.hover', borderRadius: 1, mt: 0.75 }}>
                  <AccordionSummary>
                    <Typography
                      component="span"
                      sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }}
                      variant="body2"
                    >
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
        })}
      </Stack>
    </>
  );
};
