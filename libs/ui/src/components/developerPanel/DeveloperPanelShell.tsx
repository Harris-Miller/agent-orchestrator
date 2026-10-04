import { useAtom, useAtomValue } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import type { FC, ReactNode, SyntheticEvent } from 'react';

import { backendHarnessStateAtom, rpcWireLogLaunchTargetAtom } from '../../atoms/backendState.atoms.ts';
import type { SessionSnapshot } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel, ALL_AGENT_LAUNCH_TARGETS } from '../../host/agentLaunchTarget.ts';
import type { RpcWireEntry } from '../../host/backendHarness.ts';
import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';

import { FsMentionListingTab } from './FsMentionListingTab.tsx';
import { PanelHeader } from './PanelHeader.tsx';
import {
  cascadedWireIds,
  classifyRpcWireLog,
  coerceWireIdFilter,
  filterClassifiedRpcWireEntries,
  RPC_WIRE_FILTER_ALL,
} from './rpcWireLogFilter.ts';
import { SessionStateView } from './SessionStateView.tsx';

export const DEVELOPER_PANEL_HEIGHT = 320;

const SESSION_STATE_TAB = 'session-state' as const;
const FS_MENTION_LISTING_TAB = 'fs-mention-listing' as const;

export type DeveloperPanelExtraTab = {
  readonly content: ReactNode;
  readonly id: string;
  readonly label: string;
};

type DeveloperPanelTab = string;

const isAgentLaunchTarget = (value: string): value is AgentLaunchTarget =>
  (ALL_AGENT_LAUNCH_TARGETS as readonly string[]).includes(value);

const rpcWireEntryClipboardText = (entry: RpcWireEntry): string =>
  JSON.stringify({ direction: entry.direction, message: entry.message }, null, 2);

const wireIdMenuLabel = (wireId: string): string => (wireId === '' ? 'id: ""' : wireId);

const RpcWireLogBody: FC<{
  readonly launchTarget: AgentLaunchTarget;
  readonly onCopyError: (error: unknown) => void;
}> = ({ launchTarget, onCopyError }) => {
  const snapshot = useAtomValue(backendHarnessStateAtom(launchTarget));
  const entries = snapshot.rpcCalls;
  const [sessionFilter, setSessionFilter] = useState(RPC_WIRE_FILTER_ALL);
  const [tagFilter, setTagFilter] = useState(RPC_WIRE_FILTER_ALL);
  const [wireIdFilter, setWireIdFilter] = useState(RPC_WIRE_FILTER_ALL);

  const classification = useMemo(() => classifyRpcWireLog(entries), [entries]);
  const idOptions = useMemo(
    () => cascadedWireIds(classification.classified, { sessionKey: sessionFilter, tag: tagFilter }),
    [classification.classified, sessionFilter, tagFilter],
  );
  const effectiveWireIdFilter = coerceWireIdFilter(wireIdFilter, idOptions);
  const filtered = useMemo(
    () =>
      filterClassifiedRpcWireEntries(classification.classified, {
        sessionKey: sessionFilter,
        tag: tagFilter,
        wireId: effectiveWireIdFilter,
      }),
    [classification.classified, effectiveWireIdFilter, sessionFilter, tagFilter],
  );

  if (entries.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No RPC traffic yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id={`rpc-wire-session-${launchTarget}`}>Session</InputLabel>
          <Select
            label="Session"
            labelId={`rpc-wire-session-${launchTarget}`}
            onChange={event => {
              const nextSession = event.target.value;
              setSessionFilter(nextSession);
              setWireIdFilter(current =>
                coerceWireIdFilter(
                  current,
                  cascadedWireIds(classification.classified, {
                    sessionKey: nextSession,
                    tag: tagFilter,
                  }),
                ),
              );
            }}
            value={sessionFilter}
          >
            <MenuItem value={RPC_WIRE_FILTER_ALL}>All</MenuItem>
            {classification.sessionKeys.map(sessionKey => (
              <MenuItem key={sessionKey} value={sessionKey}>
                {sessionKey}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id={`rpc-wire-tag-${launchTarget}`}>Tag</InputLabel>
          <Select
            label="Tag"
            labelId={`rpc-wire-tag-${launchTarget}`}
            onChange={event => {
              const nextTag = event.target.value;
              setTagFilter(nextTag);
              setWireIdFilter(current =>
                coerceWireIdFilter(
                  current,
                  cascadedWireIds(classification.classified, {
                    sessionKey: sessionFilter,
                    tag: nextTag,
                  }),
                ),
              );
            }}
            value={tagFilter}
          >
            <MenuItem value={RPC_WIRE_FILTER_ALL}>All</MenuItem>
            {classification.tags.map(tag => (
              <MenuItem key={tag} value={tag}>
                {tag}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id={`rpc-wire-id-${launchTarget}`}>Id</InputLabel>
          <Select
            displayEmpty
            label="Id"
            labelId={`rpc-wire-id-${launchTarget}`}
            onChange={event => {
              setWireIdFilter(event.target.value);
            }}
            value={effectiveWireIdFilter}
          >
            <MenuItem value={RPC_WIRE_FILTER_ALL}>All</MenuItem>
            {idOptions.map(wireId => (
              <MenuItem key={wireId === '' ? 'empty-id' : wireId} value={wireId}>
                {wireIdMenuLabel(wireId)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography color="text.secondary" variant="caption">
          {filtered.length} / {entries.length} shown
        </Typography>
      </Stack>
      {filtered.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          No RPC traffic match filters.
        </Typography>
      ) : (
        filtered.map(({ entry, facet }) => (
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
                {facet.title}
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
        ))
      )}
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
  const isFsMentionListingTab = activeTab === FS_MENTION_LISTING_TAB;
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
        <Tab
          label="@ FS listing"
          sx={{ minHeight: 36, py: 0.5, textTransform: 'none' }}
          value={FS_MENTION_LISTING_TAB}
        />
        {extraTabs.map(tab => (
          <Tab key={tab.id} label={tab.label} sx={{ minHeight: 36, py: 0.5, textTransform: 'none' }} value={tab.id} />
        ))}
      </Tabs>
      <Box
        sx={{
          display: isFsMentionListingTab ? 'flex' : 'block',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          overflow: isFsMentionListingTab ? 'hidden' : 'auto',
          p: bodyPadding,
        }}
      >
        {isAgentLaunchTarget(activeTab) ? (
          <RpcWireLogBody launchTarget={activeTab} onCopyError={onCopyError} />
        ) : activeTab === SESSION_STATE_TAB ? (
          <SessionStateView initializeResult={initializeResult} session={session} />
        ) : isFsMentionListingTab ? (
          <FsMentionListingTab />
        ) : (
          (activeExtraTab?.content ?? null)
        )}
      </Box>
    </Box>
  );
};
