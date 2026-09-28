import { useAtom, useAtomValue } from '@effect/atom-react';
import { Clipboard } from '@lib/context-services';
import type { AgentLaunchTarget, RpcWireEntry } from '@lib/ui';
import {
  agentLaunchTargetLabel,
  ALL_AGENT_LAUNCH_TARGETS,
  backendHarnessStateAtom,
  hostRunPromise,
  isRecord,
  rpcWireLogLaunchTargetAtom,
} from '@lib/ui';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { Effect } from 'effect';
import type { FC, SyntheticEvent } from 'react';

import { PanelHeader } from '../shared/PanelHeader.tsx';

export const RPC_WIRE_LOG_PANEL_HEIGHT = 320;

const entryIdNameMap = new Map<number, string>();

const rpcWireTagLabel = (message: Record<string, unknown>): null | string => {
  if (typeof message.tag !== 'string') return null;
  if (message.tag === 'session/update' && isRecord(message.payload) && isRecord(message.payload.update)) {
    const { sessionUpdate } = message.payload.update;
    if (typeof sessionUpdate === 'string') {
      return `${message.tag} ${sessionUpdate}`;
    }
  }
  return message.tag;
};

const rpcWireEntryTitle = (entry: RpcWireEntry): string => {
  const arrow = entry.direction === 'out' ? '→' : '←';
  if (isRecord(entry.message)) {
    if (entry.direction === 'in') {
      if (entry.message.requestId != null) {
        const cachedName = entryIdNameMap.get(entry.message.requestId as number);
        return `${arrow} ${cachedName ?? 'message'}`;
      }
      const tagLabel = rpcWireTagLabel(entry.message);
      if (tagLabel != null) {
        return `${arrow} ${tagLabel}`;
      }
      return `${arrow} message`;
    }

    const cachedName = (() => {
      const tagLabel = rpcWireTagLabel(entry.message);
      if (tagLabel != null) {
        return tagLabel;
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
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
}> = ({ onClose, onCopyError }) => {
  const [rpcLaunchTarget, setRpcLaunchTarget] = useAtom(rpcWireLogLaunchTargetAtom);
  const snapshot = useAtomValue(backendHarnessStateAtom(rpcLaunchTarget));
  const entries = snapshot.rpcCalls;

  return (
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
      <Tabs
        onChange={(_event: SyntheticEvent, value: AgentLaunchTarget) => {
          setRpcLaunchTarget(value);
        }}
        sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, minHeight: 36 }}
        value={rpcLaunchTarget}
        variant="scrollable"
      >
        {ALL_AGENT_LAUNCH_TARGETS.map(launchTarget => (
          <Tab
            key={launchTarget}
            label={agentLaunchTargetLabel(launchTarget)}
            sx={{ minHeight: 36, py: 0.5, textTransform: 'none' }}
            value={launchTarget}
          />
        ))}
      </Tabs>
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
                    component="span"
                    onClick={event => {
                      event.stopPropagation();
                      hostRunPromise(
                        Effect.gen(function* () {
                          const clipboard = yield* Clipboard;
                          yield* clipboard.writeText(rpcWireEntryClipboardText(entry));
                        }),
                      ).catch(onCopyError);
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
};
