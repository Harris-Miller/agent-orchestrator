import { useAtomValue } from '@effect/atom-react';
import { useMemo, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { allRpcWireCallsAtom, selectedSessionIdAtom } from '../../atoms/backendState.atoms.ts';
import type { SessionSnapshot } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel, ALL_AGENT_LAUNCH_TARGETS } from '../../host/agentLaunchTarget.ts';
import type { RpcWireEntry } from '../../host/backendHarness.ts';
import { writeTextToClipboard } from '../../host/writeTextToClipboard.ts';
import { hostRunPromise } from '../../hostRuntime.ts';
import { LabeledSelect } from '../LabeledSelect.tsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion.tsx';
import { Button } from '../ui/button.tsx';
import { Switch } from '../ui/switch.tsx';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs.tsx';

import { ComposerTab } from './ComposerTab.tsx';
import { FsMentionListingTab } from './FsMentionListingTab.tsx';
import { PanelHeader } from './PanelHeader.tsx';
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

export const DEVELOPER_PANEL_HEIGHT = 320;

const RPC_WIRE_LOG_TAB = 'rpc-wire-log' as const;
const SESSION_STATE_TAB = 'session-state' as const;
const FS_MENTION_LISTING_TAB = 'fs-mention-listing' as const;
const COMPOSER_TAB = 'composer' as const;

export type DeveloperPanelExtraTab = {
  readonly content: ReactNode;
  readonly id: string;
  readonly label: string;
};

type DeveloperPanelTab = string;

const rpcWireEntryClipboardText = (entry: RpcWireEntry, launchTarget: AgentLaunchTarget): string =>
  JSON.stringify({ direction: entry.direction, launchTarget, message: entry.message }, null, 2);

const wireIdMenuLabel = (wireId: string): string => (wireId === '' ? 'id: ""' : wireId);

/** Base UI treats a value that stringifies to '' as unselected, so a blank wire id uses a sentinel in the menu only. */
const EMPTY_WIRE_ID_VALUE = '\u0000';
const toWireIdSelectValue = (wireId: string): string => (wireId === '' ? EMPTY_WIRE_ID_VALUE : wireId);
const fromWireIdSelectValue = (value: string): string => (value === EMPTY_WIRE_ID_VALUE ? '' : value);

const isLaunchTargetFilter = (value: string): value is RpcWireLaunchTargetFilter =>
  value === RPC_WIRE_FILTER_ALL || ALL_AGENT_LAUNCH_TARGETS.some(target => target === value);

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
    return <p className="text-sm text-muted-foreground">No RPC traffic yet.</p>;
  }

  const coerceWireIdForCascade = (
    filters: Pick<RpcWireFilters, 'launchTarget' | 'sessionKey' | 'tag'>,
    wireId: string,
  ): string => coerceWireIdFilter(wireId, cascadedWireIds(classification.classified, filters));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-end gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Switch
            aria-labelledby="rpc-wire-active-session-label"
            checked={activeSessionOnly}
            onCheckedChange={checked => {
              setActiveSessionOnly(checked);
              setWireIdFilter(RPC_WIRE_FILTER_ALL);
            }}
          />
          <span id="rpc-wire-active-session-label">Active session</span>
        </div>
        <LabeledSelect
          disabled={activeSessionOnly}
          id="rpc-wire-launch-target"
          label="Launch target"
          onValueChange={nextLaunchTarget => {
            if (!isLaunchTargetFilter(nextLaunchTarget)) {
              return;
            }
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
          options={[
            { label: 'All', value: RPC_WIRE_FILTER_ALL },
            ...ALL_AGENT_LAUNCH_TARGETS.map(launchTarget => ({
              label: agentLaunchTargetLabel(launchTarget),
              value: launchTarget,
            })),
          ]}
          value={launchTargetFilter}
        />
        <LabeledSelect
          disabled={activeSessionOnly}
          id="rpc-wire-session"
          label="Session"
          onValueChange={nextSession => {
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
          options={[
            { label: 'All', value: RPC_WIRE_FILTER_ALL },
            ...sessionOptions.map(sessionKey => ({ label: sessionKey, value: sessionKey })),
          ]}
          value={sessionFilter}
        />
        <LabeledSelect
          id="rpc-wire-tag"
          label="Tag"
          onValueChange={nextTag => {
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
          options={[
            { label: 'All', value: RPC_WIRE_FILTER_ALL },
            ...classification.tags.map(tag => ({ label: tag, value: tag })),
          ]}
          value={tagFilter}
        />
        <LabeledSelect
          id="rpc-wire-id"
          label="Id"
          onValueChange={value => {
            setWireIdFilter(fromWireIdSelectValue(value));
          }}
          options={[
            { label: 'All', value: RPC_WIRE_FILTER_ALL },
            ...idOptions.map(wireId => ({ label: wireIdMenuLabel(wireId), value: toWireIdSelectValue(wireId) })),
          ]}
          value={toWireIdSelectValue(effectiveWireIdFilter)}
        />
        <p className="text-xs text-muted-foreground">
          {filtered.length} / {entryCount} shown
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No RPC traffic match filters.</p>
        ) : (
          filtered.map(({ entry, launchTarget, meta }) => (
            <Accordion key={entry.id}>
              <AccordionItem className="rounded-md border-0 bg-muted" value={entry.id}>
                <div className="flex items-center pr-2">
                  <AccordionTrigger className="min-w-0 flex-1 py-2 font-mono text-xs">
                    [{agentLaunchTargetLabel(launchTarget)}] {meta.title}
                  </AccordionTrigger>
                  <Button
                    onClick={() => {
                      hostRunPromise(writeTextToClipboard(rpcWireEntryClipboardText(entry, launchTarget))).catch(
                        onCopyError,
                      );
                    }}
                    size="xs"
                    variant="ghost"
                  >
                    copy
                  </Button>
                </div>
                <AccordionContent>
                  <pre className="m-0 overflow-auto font-mono text-xs whitespace-pre-wrap">
                    {rpcWireEntryClipboardText(entry, launchTarget)}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ))
        )}
      </div>
    </div>
  );
};

export const DeveloperPanelShell: FC<{
  readonly extraTabs?: readonly DeveloperPanelExtraTab[];
  readonly initializeResult: unknown;
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
  readonly session?: SessionSnapshot;
}> = ({ extraTabs = [], initializeResult, onClose, onCopyError, session }) => {
  const [activeTab, setActiveTab] = useState<DeveloperPanelTab>(RPC_WIRE_LOG_TAB);
  const activeExtraTab = extraTabs.find(tab => tab.id === activeTab);
  const isFsMentionListingTab = activeTab === FS_MENTION_LISTING_TAB;
  const isRpcWireLogTab = activeTab === RPC_WIRE_LOG_TAB;
  const containsOwnScroll = isFsMentionListingTab || isRpcWireLogTab;
  const bodyPadding = isRpcWireLogTab || activeTab === SESSION_STATE_TAB ? 'p-4' : '';

  return (
    <div className="box-border flex h-full min-h-0 min-w-0 flex-col bg-card">
      <PanelHeader closeAriaLabel="Close developer panel" closeGlyph="∨" onClose={onClose} title="Developer panel" />
      <Tabs
        className="flex-none"
        onValueChange={value => {
          if (value !== null) {
            setActiveTab(String(value));
          }
        }}
        value={activeTab}
      >
        <TabsList
          className="h-auto w-full min-w-0 justify-start overflow-x-auto rounded-none border-b border-border"
          variant="line"
        >
          <TabsTrigger className="flex-none" value={RPC_WIRE_LOG_TAB}>
            RPC wire
          </TabsTrigger>
          <TabsTrigger className="flex-none" value={SESSION_STATE_TAB}>
            Session State
          </TabsTrigger>
          <TabsTrigger className="flex-none" value={FS_MENTION_LISTING_TAB}>
            @ FS listing
          </TabsTrigger>
          <TabsTrigger className="flex-none" value={COMPOSER_TAB}>
            Composer
          </TabsTrigger>
          {extraTabs.map(tab => (
            <TabsTrigger className="flex-none" key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div
        className={
          containsOwnScroll
            ? `flex min-h-0 flex-1 flex-col overflow-hidden ${bodyPadding}`
            : `min-h-0 flex-1 overflow-auto ${bodyPadding}`
        }
      >
        {activeTab === RPC_WIRE_LOG_TAB ? (
          <RpcWireLogBody onCopyError={onCopyError} />
        ) : activeTab === SESSION_STATE_TAB ? (
          <SessionStateView initializeResult={initializeResult} session={session} />
        ) : isFsMentionListingTab ? (
          <FsMentionListingTab />
        ) : activeTab === COMPOSER_TAB ? (
          <ComposerTab />
        ) : (
          (activeExtraTab?.content ?? null)
        )}
      </div>
    </div>
  );
};
