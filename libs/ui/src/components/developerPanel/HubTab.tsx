import { useAtomValue } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Predicate } from 'effect';
import type { FC } from 'react';

import { hubAvailabilityAtom, hubWireEntriesAtom, sessionHubStatusesAtom } from '../../atoms/hub.atoms.ts';
import type { HubAvailability } from '../../host/hubConnection.ts';
import { clearHubWire } from '../../host/hubWireLog.ts';
import type { HubWireEntry } from '../../host/hubWireLog.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';

import { Section } from './SessionStateView.tsx';

const availabilityColor = (availability: HubAvailability) =>
  availability._tag === 'available' ? 'success' : availability._tag === 'connecting' ? 'warning' : 'error';

const entryTitle = (entry: HubWireEntry): string => {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const arrow = entry.direction === 'sent' ? '→' : '←';
  const { message } = entry;
  if (!Predicate.isObject(message)) {
    return `${time} ${arrow}`;
  }
  const detail = typeof message.tool === 'string' ? ` ${message.tool}` : '';
  return `${time} ${arrow} ${String(message.type)}${detail}`;
};

const monoSx = { fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' } as const;

/** Developer panel: hub connection, per-session hub status, and the `/clients` frames sent and received. */
export const HubTab: FC = () => {
  const availability = useAtomValue(hubAvailabilityAtom);
  const statuses = useAtomValue(sessionHubStatusesAtom);
  const wire = useAtomValue(hubWireEntriesAtom);

  return (
    <Stack spacing={2}>
      <Section title="Connection">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Chip color={availabilityColor(availability)} label={availability._tag} size="small" />
          {availability._tag === 'unavailable' ? <Typography variant="body2">{availability.reason}</Typography> : null}
        </Stack>
      </Section>
      <Section title={`Sessions (${statuses.size})`}>
        {statuses.size === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No sessions yet.
          </Typography>
        ) : (
          [...statuses].map(([key, status]) => (
            <Typography key={key} sx={monoSx} variant="body2">
              {key.replace('\u0000', ' / ')}: {status._tag === 'bound' ? 'bound' : `none (${status.reason})`}
            </Typography>
          ))
        )}
      </Section>
      <Section title={`Messages (${wire.length})`}>
        <Box>
          <Button disabled={wire.length === 0} onClick={clearHubWire} size="small">
            Clear
          </Button>
        </Box>
        {wire.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No hub traffic yet.
          </Typography>
        ) : (
          wire.toReversed().map(entry => (
            <Accordion
              key={entry.id}
              slotProps={{ transition: { unmountOnExit: true } }}
              sx={{ bgcolor: 'action.hover', borderRadius: 1 }}
            >
              <AccordionSummary>
                <Typography component="span" sx={monoSx} variant="body2">
                  {entryTitle(entry)}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Box component="pre" sx={{ ...monoSx, m: 0, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(entry.message, null, 2)}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Section>
    </Stack>
  );
};
