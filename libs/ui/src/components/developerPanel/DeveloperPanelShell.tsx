import { useAtomValue } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FC, ReactNode, SyntheticEvent } from 'react';

import { exportedAtomName } from '../../atoms/atomNames.ts';
import { allRpcWireCallsAtom, selectedSessionIdAtom } from '../../atoms/backendState.atoms.ts';
import type { SessionSnapshot } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel, MOUNTED_AGENT_LAUNCH_TARGETS } from '../../host/agentLaunchTarget.ts';
import type { RpcWireEntry } from '../../host/backendHarness.ts';
import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { FieldLabel } from '../FieldLabel.tsx';

import { AtomsTab } from './AtomsTab.tsx';
import { ComposerTab } from './ComposerTab.tsx';
import { FsMentionListingTab } from './FsMentionListingTab.tsx';
import { MuiThemePlaygroundTab } from './MuiThemePlaygroundTab.tsx';
import { PanelHeader } from './PanelHeader.tsx';
import { ProviderStateView } from './ProviderStateView.tsx';
import {
  cascadedWireIds,
  classifyRpcWireLog,
  coerceWireIdFilter,
  filterClassifiedRpcWireEntries,
  mergeClassifiedRpcWireLogs,
  resolveSessionFilter,
  RPC_WIRE_FILTER_ALL,
  sessionKeysForLaunchTarget,
} from './rpcWireLogFilter.ts';
import type { RpcWireFilters, RpcWireLaunchTargetFilter } from './rpcWireLogFilter.ts';
import { SessionStateView } from './SessionStateView.tsx';
import { CLOSE_DEVELOPER_PANEL_LABEL } from './ToggleDeveloperPanelButton.tsx';

export const DEVELOPER_PANEL_HEIGHT = 320;

export type DeveloperPanelExtraTab = {
  readonly content: ReactNode;
  readonly id: string;
  readonly label: string;
};

type DeveloperPanelTab = string;

const rpcWireEntryClipboardText = (entry: RpcWireEntry, launchTarget: AgentLaunchTarget): string =>
  JSON.stringify({ direction: entry.direction, launchTarget, message: entry.message }, null, 2);

const wireIdMenuLabel = (wireId: string): string => (wireId === '' ? 'id: ""' : wireId);

const RpcWireLogBody: FC<{
  readonly onCopyError: (error: unknown) => void;
}> = ({ onCopyError }) => {
  const activeSessionId = useAtomValue(selectedSessionIdAtom);
  const wireLogs = useAtomValue(allRpcWireCallsAtom);

  const [activeSessionOnly, setActiveSessionOnly] = useState(false);
  const [launchTargetFilter, setLaunchTargetFilter] = useState<RpcWireLaunchTargetFilter>(RPC_WIRE_FILTER_ALL);
  const [sessionFilter, setSessionFilter] = useState(RPC_WIRE_FILTER_ALL);
  const [tagFilter, setTagFilter] = useState(RPC_WIRE_FILTER_ALL);
  const [wireIdFilter, setWireIdFilter] = useState(RPC_WIRE_FILTER_ALL);

  const classification = useMemo(
    () =>
      mergeClassifiedRpcWireLogs(
        wireLogs.map(({ entries, launchTarget }) => classifyRpcWireLog(entries, launchTarget)),
      ),
    [wireLogs],
  );

  const launchTargetForFilters = activeSessionOnly ? RPC_WIRE_FILTER_ALL : launchTargetFilter;
  const sessionOptions = useMemo(
    () => sessionKeysForLaunchTarget(classification.classified, launchTargetForFilters),
    [classification.classified, launchTargetForFilters],
  );
  const resolvedSessionFilter = resolveSessionFilter(activeSessionOnly, sessionFilter, activeSessionId);

  const idOptions = useMemo(() => {
    if (resolvedSessionFilter === null) {
      return [];
    }
    return cascadedWireIds(classification.classified, {
      launchTarget: launchTargetForFilters,
      sessionKey: resolvedSessionFilter,
      tag: tagFilter,
    });
  }, [classification.classified, launchTargetForFilters, resolvedSessionFilter, tagFilter]);

  const effectiveWireIdFilter = coerceWireIdFilter(wireIdFilter, idOptions);
  const filtered = useMemo(() => {
    if (resolvedSessionFilter === null) {
      return [];
    }
    return filterClassifiedRpcWireEntries(classification.classified, {
      launchTarget: launchTargetForFilters,
      sessionKey: resolvedSessionFilter,
      tag: tagFilter,
      wireId: effectiveWireIdFilter,
    });
  }, [classification.classified, effectiveWireIdFilter, launchTargetForFilters, resolvedSessionFilter, tagFilter]);

  const entryCount = classification.classified.length;

  if (entryCount === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No RPC traffic yet.
      </Typography>
    );
  }

  const coerceWireIdForCascade = (
    filters: Pick<RpcWireFilters, 'launchTarget' | 'sessionKey' | 'tag'>,
    wireId: string,
  ): string => coerceWireIdFilter(wireId, cascadedWireIds(classification.classified, filters));

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }} useFlexGap>
        <FormControlLabel
          control={
            <Switch
              checked={activeSessionOnly}
              onChange={(_event, checked) => {
                setActiveSessionOnly(checked);
                setWireIdFilter(RPC_WIRE_FILTER_ALL);
              }}
            />
          }
          label="Active session"
        />
        <FieldLabel id="rpc-wire-launch-target" label="Launch target">
          <FormControl disabled={activeSessionOnly} size="small" sx={{ minWidth: 140 }}>
            <Select
              aria-labelledby="rpc-wire-launch-target"
              onChange={event => {
                const nextLaunchTarget = event.target.value;
                setLaunchTargetFilter(nextLaunchTarget);
                setSessionFilter(RPC_WIRE_FILTER_ALL);
                setWireIdFilter(current =>
                  coerceWireIdForCascade(
                    {
                      launchTarget: nextLaunchTarget,
                      sessionKey: RPC_WIRE_FILTER_ALL,
                      tag: tagFilter,
                    },
                    current,
                  ),
                );
              }}
              value={launchTargetFilter}
            >
              <MenuItem value={RPC_WIRE_FILTER_ALL}>All</MenuItem>
              {MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => (
                <MenuItem key={launchTarget} value={launchTarget}>
                  {agentLaunchTargetLabel(launchTarget)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FieldLabel>
        <FieldLabel id="rpc-wire-session" label="Session">
          <FormControl disabled={activeSessionOnly} size="small" sx={{ minWidth: 140 }}>
            <Select
              aria-labelledby="rpc-wire-session"
              onChange={event => {
                const nextSession = event.target.value;
                setSessionFilter(nextSession);
                setWireIdFilter(current =>
                  coerceWireIdForCascade(
                    {
                      launchTarget: launchTargetFilter,
                      sessionKey: nextSession,
                      tag: tagFilter,
                    },
                    current,
                  ),
                );
              }}
              value={sessionFilter}
            >
              <MenuItem value={RPC_WIRE_FILTER_ALL}>All</MenuItem>
              {sessionOptions.map(sessionKey => (
                <MenuItem key={sessionKey} value={sessionKey}>
                  {sessionKey}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FieldLabel>
        <FieldLabel id="rpc-wire-tag" label="Tag">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              aria-labelledby="rpc-wire-tag"
              onChange={event => {
                const nextTag = event.target.value;
                setTagFilter(nextTag);
                setWireIdFilter(current => {
                  if (resolvedSessionFilter === null) {
                    return RPC_WIRE_FILTER_ALL;
                  }
                  return coerceWireIdForCascade(
                    {
                      launchTarget: launchTargetForFilters,
                      sessionKey: resolvedSessionFilter,
                      tag: nextTag,
                    },
                    current,
                  );
                });
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
        </FieldLabel>
        <FieldLabel id="rpc-wire-id" label="Id">
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              aria-labelledby="rpc-wire-id"
              displayEmpty
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
        </FieldLabel>
        <Typography color="text.secondary" variant="caption">
          {filtered.length} / {entryCount} shown
        </Typography>
      </Stack>
      <Stack spacing={1} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            No RPC traffic match filters.
          </Typography>
        ) : (
          filtered.map(({ entry, launchTarget, meta }) => (
            <Accordion key={entry.id} sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
              <AccordionSummary>
                <Typography component="span" sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: '0.75rem' }} variant="body2">
                  [{agentLaunchTargetLabel(launchTarget)}] {meta.title}
                </Typography>
                <Button
                  component="span"
                  onClick={event => {
                    event.stopPropagation();
                    hostRunPromise(writeTextToClipboard(rpcWireEntryClipboardText(entry, launchTarget))).catch(
                      onCopyError,
                    );
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
                  {rpcWireEntryClipboardText(entry, launchTarget)}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Stack>
    </Stack>
  );
};

type BuiltInTabProps = {
  readonly onCopyError: (error: unknown) => void;
  readonly session?: SessionSnapshot;
};

type BuiltInTab = {
  readonly id: string;
  readonly label: string;
  /** Body handles its own scrolling (the panel body then clips and lays out as a column). */
  readonly ownScroll: boolean;
  readonly padded: boolean;
  readonly render: (props: BuiltInTabProps) => ReactNode;
};

const BUILT_IN_TABS: readonly BuiltInTab[] = [
  {
    id: 'rpc-wire-log',
    label: 'RPC wire',
    ownScroll: true,
    padded: true,
    render: ({ onCopyError }) => <RpcWireLogBody onCopyError={onCopyError} />,
  },
  {
    id: 'provider-state',
    label: 'Provider State',
    ownScroll: false,
    padded: true,
    render: () => <ProviderStateView />,
  },
  {
    id: 'session-state',
    label: 'Session State',
    ownScroll: false,
    padded: true,
    render: ({ session }) => <SessionStateView session={session} />,
  },
  {
    id: 'atoms',
    label: 'Atoms',
    ownScroll: true,
    padded: true,
    render: ({ onCopyError }) => <AtomsTab nameOf={exportedAtomName} onCopyError={onCopyError} />,
  },
  {
    id: 'fs-mention-listing',
    label: '@ FS listing',
    ownScroll: true,
    padded: false,
    render: () => <FsMentionListingTab />,
  },
  { id: 'composer', label: 'Composer', ownScroll: false, padded: false, render: () => <ComposerTab /> },
  {
    id: 'mui-theme-playground',
    label: 'MUI playground',
    ownScroll: false,
    padded: true,
    render: () => <MuiThemePlaygroundTab />,
  },
];

export const DeveloperPanelShell: FC<{
  readonly extraTabs?: readonly DeveloperPanelExtraTab[];
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
  readonly session?: SessionSnapshot;
}> = ({ extraTabs = [], onClose, onCopyError, session }) => {
  const [activeTab, setActiveTab] = useState<DeveloperPanelTab>(BUILT_IN_TABS[0]?.id ?? '');
  const builtIn = BUILT_IN_TABS.find(tab => tab.id === activeTab);
  const containsOwnScroll = builtIn?.ownScroll ?? false;
  const bodyPadding = builtIn?.padded === true ? 2 : 0;

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <PanelHeader
        closeAriaLabel={CLOSE_DEVELOPER_PANEL_LABEL}
        closeIcon={X}
        onClose={onClose}
        title="Developer panel"
      />
      <Tabs
        onChange={(_event: SyntheticEvent, value: DeveloperPanelTab) => {
          setActiveTab(value);
        }}
        sx={{ flexShrink: 0 }}
        value={activeTab}
        variant="scrollable"
      >
        {BUILT_IN_TABS.map(tab => (
          <Tab key={tab.id} label={tab.label} value={tab.id} />
        ))}
        {extraTabs.map(tab => (
          <Tab key={tab.id} label={tab.label} value={tab.id} />
        ))}
      </Tabs>
      <Box
        sx={{
          display: containsOwnScroll ? 'flex' : 'block',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          overflow: containsOwnScroll ? 'hidden' : 'auto',
          p: bodyPadding,
        }}
      >
        {builtIn === undefined
          ? (extraTabs.find(tab => tab.id === activeTab)?.content ?? null)
          : builtIn.render({ onCopyError, session })}
      </Box>
    </Box>
  );
};
