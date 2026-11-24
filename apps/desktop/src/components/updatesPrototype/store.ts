/**
 * PROTOTYPE (#457, throwaway): mock "updates available" state + stubbed actions.
 * Three variants of the updates indicator next to the Settings gear, switched by the bottom bar (DEV only).
 * Nothing here touches real Provider runtimes: Download / Install are timers.
 */
import type { ComponentProps } from 'react';
import { useSyncExternalStore } from 'react';

import type { AgentLaunchTargetIcon } from '@lib/ui';

export type LaunchTarget = ComponentProps<typeof AgentLaunchTargetIcon>['launchTarget'];

export type Phase = 'available' | 'downloading' | 'done' | 'installing' | 'ready';

export type UpdateItem = {
  readonly from: string;
  readonly icon: LaunchTarget | undefined;
  readonly id: string;
  readonly kind: 'app' | 'provider';
  readonly label: string;
  readonly notes: string;
  readonly phase: Phase;
  /** Live sessions Install would close (Providers only). */
  readonly sessions: number;
  readonly to: string;
};

export type Scenario = 'app+providers' | 'busy' | 'check-failed' | 'providers' | 'ready' | 'up-to-date';

export const SCENARIOS: readonly { readonly key: Scenario; readonly label: string }[] = [
  { key: 'up-to-date', label: 'Up to date' },
  { key: 'providers', label: '2 providers' },
  { key: 'app+providers', label: 'App + providers' },
  { key: 'ready', label: 'Ready to install (sessions open)' },
  { key: 'busy', label: 'In progress' },
  { key: 'check-failed', label: 'Check failed' },
];

export const VARIANTS = [
  { key: 'A', name: 'Badge + list' },
  { key: 'B', name: 'Pill + Update all' },
  { key: 'C', name: 'Tabs + release cards' },
] as const;
export type VariantKey = (typeof VARIANTS)[number]['key'];

const claude = (phase: Phase, sessions = 0): UpdateItem => ({
  from: '0.9.1',
  icon: 'claude-agent-acp',
  id: 'claude',
  kind: 'provider',
  label: 'Claude',
  notes: 'Faster tool-call streaming, fixes a hang when resuming long sessions.',
  phase,
  sessions,
  to: '0.9.4',
});
const codex = (phase: Phase): UpdateItem => ({
  from: '0.5.0',
  icon: 'codex-acp',
  id: 'codex',
  kind: 'provider',
  label: 'Codex',
  notes: 'New model list, improved sandbox error messages.',
  phase,
  sessions: 0,
  to: '0.6.0',
});
const app = (phase: Phase): UpdateItem => ({
  from: '0.1.0',
  icon: undefined,
  id: 'app',
  kind: 'app',
  label: 'HOA',
  notes: 'Restyled subagent rows, active-subagents strip, startup fixes.',
  phase,
  sessions: 0,
  to: '0.2.0',
});

const itemsFor = (scenario: Scenario): readonly UpdateItem[] => {
  switch (scenario) {
    case 'up-to-date':
      return [];
    case 'providers':
      return [claude('available'), codex('available')];
    case 'app+providers':
      return [app('available'), claude('available'), codex('available')];
    case 'ready':
      return [claude('ready', 2), codex('available')];
    case 'busy':
      return [app('available'), claude('downloading'), codex('installing')];
    case 'check-failed':
      return [codex('available')];
  }
};

type State = {
  readonly confirm: string | undefined;
  readonly items: readonly UpdateItem[];
  readonly scenario: Scenario;
  readonly variant: VariantKey;
};

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const value = window.sessionStorage.getItem(key);
    return allowed.find(candidate => candidate === value) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: string) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const initialScenario = read<Scenario>(
  'proto457.scenario',
  SCENARIOS.map(s => s.key),
  'providers',
);
let state: State = {
  confirm: undefined,
  items: itemsFor(initialScenario),
  scenario: initialScenario,
  variant: read<VariantKey>(
    'proto457.variant',
    VARIANTS.map(v => v.key),
    'A',
  ),
};
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach(listener => {
    listener();
  });
};
const patch = (id: string, phase: Phase) => {
  set({ items: state.items.map(item => (item.id === id ? { ...item, phase } : item)) });
};

export const useProtoState = (): State =>
  useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );

export const setVariant = (variant: VariantKey) => {
  write('proto457.variant', variant);
  set({ variant });
};
export const setScenario = (scenario: Scenario) => {
  write('proto457.scenario', scenario);
  set({ confirm: undefined, items: itemsFor(scenario), scenario });
};

export const download = (id: string) => {
  patch(id, 'downloading');
  setTimeout(() => {
    patch(id, 'ready');
  }, 1800);
};
const runInstall = (id: string) => {
  patch(id, 'installing');
  setTimeout(() => {
    patch(id, 'done');
  }, 1500);
};
/** Install closes live sessions (Providers): ask first, like `useProviderControls` does. */
export const install = (id: string) => {
  const item = state.items.find(candidate => candidate.id === id);
  if (item !== undefined && item.sessions > 0) {
    set({ confirm: id });
    return;
  }
  runInstall(id);
};
export const confirmInstall = () => {
  const id = state.confirm;
  set({ confirm: undefined });
  if (id !== undefined) runInstall(id);
};
export const cancelInstall = () => {
  set({ confirm: undefined });
};
/** Variant B: download everything pending, then install whatever is ready. */
export const updateAll = () => {
  for (const item of state.items) {
    if (item.phase === 'available') {
      download(item.id);
      setTimeout(() => {
        install(item.id);
      }, 2000);
    } else if (item.phase === 'ready') {
      install(item.id);
    }
  }
};

/** Items still needing the user (hide finished ones). */
export const pending = (items: readonly UpdateItem[]): readonly UpdateItem[] =>
  items.filter(item => item.phase !== 'done');
export const isBusy = (item: UpdateItem): boolean => item.phase === 'downloading' || item.phase === 'installing';

export const itemVersion = (item: UpdateItem): string => `v${item.from} → v${item.to}`;
