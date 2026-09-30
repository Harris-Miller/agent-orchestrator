import { useAtom, useAtomValue } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC, ReactNode, SyntheticEvent } from 'react';

import { backendHarnessStateAtom, rpcWireLogLaunchTargetAtom } from '../../atoms/backendState.atoms.ts';
import type { SessionSnapshot } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel, ALL_AGENT_LAUNCH_TARGETS } from '../../host/agentLaunchTarget.ts';
import type { RpcWireEntry } from '../../host/backendHarness.ts';
import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { isRecord } from '../../isRecord.ts';

import { PanelHeader } from './PanelHeader.tsx';
import { SessionStateView } from './SessionStateView.tsx';

export const DEVELOPER_PANEL_HEIGHT = 320;

const SESSION_STATE_TAB = 'session-state' as const;

export type DeveloperPanelExtraTab = {
  readonly content: ReactNode;
  readonly id: string;
  readonly label: string;
};

type DeveloperPanelTab = string;

const isAgentLaunchTarget = (value: string): value is AgentLaunchTarget =>
  (ALL_AGENT_LAUNCH_TARGETS as readonly string[]).includes(value);

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

const RpcWireLogBody: FC<{
  readonly launchTarget: AgentLaunchTarget;
  readonly onCopyError: (error: unknown) => void;
}> = ({ launchTarget, onCopyError }) => {
  const snapshot = useAtomValue(backendHarnessStateAtom(launchTarget));
  const entries = snapshot.rpcCalls;

  if (entries.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No RPC traffic yet.
      </Typography>
    );
  }

  return (
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
                hostRunPromise(writeTextToClipboard(rpcWireEntryClipboardText(entry))).catch(onCopyError);
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
  );
};

export const DeveloperPanelShell: FC<{
  readonly extraTabs?: readonly DeveloperPanelExtraTab[];
  readonly initializeResult: unknown;
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
  readonly session?: SessionSnapshot;
}> = ({ extraTabs = [], initializeResult, onClose, onCopyError, session }) => {
  const [rpcLaunchTarget, setRpcLaunchTarget] = useAtom(rpcWireLogLaunchTargetAtom);
  const [activeTab, setActiveTab] = useState<DeveloperPanelTab>(rpcLaunchTarget);
  const activeExtraTab = extraTabs.find(tab => tab.id === activeTab);
  const bodyPadding = isAgentLaunchTarget(activeTab) || activeTab === SESSION_STATE_TAB ? 2 : 0;

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
      <PanelHeader closeAriaLabel="Close developer panel" closeGlyph="∨" onClose={onClose} title="Developer panel" />
      <Tabs
        onChange={(_event: SyntheticEvent, value: DeveloperPanelTab) => {
          setActiveTab(value);
          if (isAgentLaunchTarget(value)) {
            setRpcLaunchTarget(value);
          }
        }}
        sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0, minHeight: 36 }}
        value={activeTab}
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
        <Tab label="Session State" sx={{ minHeight: 36, py: 0.5, textTransform: 'none' }} value={SESSION_STATE_TAB} />
        {extraTabs.map(tab => (
          <Tab key={tab.id} label={tab.label} sx={{ minHeight: 36, py: 0.5, textTransform: 'none' }} value={tab.id} />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: bodyPadding }}>
        {isAgentLaunchTarget(activeTab) ? (
          <RpcWireLogBody launchTarget={activeTab} onCopyError={onCopyError} />
        ) : activeTab === SESSION_STATE_TAB ? (
          <SessionStateView initializeResult={initializeResult} session={session} />
        ) : (
          (activeExtraTab?.content ?? null)
        )}
      </Box>
    </Box>
  );
};
