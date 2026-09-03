import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { FC } from 'react';

import { isRecord } from '../../utils.ts';

import type { RpcWireEntry } from './agentHarness.ts';
import { PanelHeader } from './PanelHeader.tsx';

export const RPC_WIRE_LOG_PANEL_HEIGHT = 320;

const entryIdNameMap = new Map<number, string>();

const rpcWireEntryTitle = (entry: RpcWireEntry): string => {
  const arrow = entry.direction === 'out' ? '→' : '←';
  if (isRecord(entry.message)) {
    if (entry.direction === 'in') {
      if (entry.message.requestId != null) {
        const cachedName = entryIdNameMap.get(entry.message.requestId as number);
        return `${arrow} ${cachedName ?? 'message'}`;
      }
      if (typeof entry.message.tag === 'string') {
        return `${arrow} ${entry.message.tag}`;
      }
      return `${arrow} message`;
    }

    const cachedName = (() => {
      if (typeof entry.message.tag === 'string') {
        return entry.message.tag;
      }
      if (typeof entry.message.method === 'string') {
        return entry.message.method;
      }
      if ('error' in entry.message) {
        return 'error';
      }
      if ('result' in entry.message) {
        return 'response';
      }
      return 'message';
    })();

    if (entry.message.id != null) {
      entryIdNameMap.set(entry.message.id as number, cachedName);
    }

    return `${arrow} ${cachedName}`;
  }

  return `${arrow} message`;
};

const rpcWireEntryClipboardText = (entry: RpcWireEntry): string =>
  JSON.stringify({ direction: entry.direction, message: entry.message }, null, 2);

export const RpcWireLogPanel: FC<{
  readonly entries: readonly RpcWireEntry[];
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
}> = ({ entries, onClose, onCopyError }) => (
  <Box
    sx={{
      bgcolor: 'background.paper',
      borderColor: 'divider',
      borderTop: 1,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}
  >
    <PanelHeader
      closeAriaLabel="Close RPC wire log panel"
      closeGlyph="∨"
      onClose={onClose}
      title={`RPC wire log (${entries.length})`}
    />
    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
      {entries.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No RPC traffic yet.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {entries.map(entry => (
            <Accordion
              disableGutters
              elevation={0}
              key={entry.id}
              sx={{
                '&::before': { display: 'none' },
                bgcolor: 'action.hover',
                borderRadius: 1,
              }}
            >
              <AccordionSummary
                sx={{ '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1, my: 0.5 }, minHeight: 36 }}
              >
                <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} variant="body2">
                  {rpcWireEntryTitle(entry)}
                </Typography>
                <Button
                  onClick={event => {
                    event.stopPropagation();
                    writeText(rpcWireEntryClipboardText(entry)).catch(onCopyError);
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
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    m: 0,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {rpcWireEntryClipboardText(entry)}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      )}
    </Box>
  </Box>
);
