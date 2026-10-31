/** PROTOTYPE (#175) — throwaway. Mock store + simulated actions (timeouts, no npm / network). Remount (key) to reset. */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

import { firstRunEnabled, PROVIDER_META, SCENARIOS } from './providersPrototype.model.ts';
import type { ProviderMock, RuntimeState, ScenarioId } from './providersPrototype.model.ts';

export type ProvidersProtoStore = {
  readonly checkedAt: number;
  readonly checkLatest: (id: AgentLaunchTarget) => void;
  /** Download (npm) / Install (registry); also used for "Install vX" updates. */
  readonly installRuntime: (id: AgentLaunchTarget) => void;
  readonly providers: readonly ProviderMock[];
  readonly recheck: (id: AgentLaunchTarget) => void;
  readonly recheckAll: () => void;
  readonly removeVersion: (id: AgentLaunchTarget, version: string) => void;
  /** Apply first-run toggle defaults once (after the first Node prerequisite pass). No-op once seeded. */
  readonly seedFirstRunDefaults: () => void;
  readonly seeded: boolean;
  readonly setActiveVersion: (id: AgentLaunchTarget, version: string) => void;
  readonly setEnabled: (id: AgentLaunchTarget, enabled: boolean) => void;
  readonly setShowOnStartup: (value: boolean) => void;
  readonly showOnStartup: boolean;
  readonly signIn: (id: AgentLaunchTarget) => void;
};

const Ctx = createContext<ProvidersProtoStore | undefined>(undefined);

export const useProvidersProto = (): ProvidersProtoStore => {
  const store = useContext(Ctx);
  if (store === undefined) {
    throw new Error('useProvidersProto outside ProvidersProtoStoreProvider');
  }
  return store;
};

export const useProviderProto = (id: AgentLaunchTarget): ProviderMock => {
  const { providers } = useProvidersProto();
  const found = providers.find(p => p.id === id);
  if (found === undefined) {
    throw new Error(`unknown provider ${id}`);
  }
  return found;
};

const later = (ms: number, fn: () => void): void => {
  setTimeout(fn, ms);
};

export const ProvidersProtoStoreProvider: FC<{ readonly children: ReactNode; readonly scenario: ScenarioId }> = ({
  children,
  scenario,
}) => {
  const [providers, setProviders] = useState<readonly ProviderMock[]>(() => SCENARIOS[scenario].build());
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [showOnStartup, setShowOnStartup] = useState(true);
  const [seeded, setSeeded] = useState<boolean>(SCENARIOS[scenario].seeded);
  const providersRef = useRef(providers);
  useLayoutEffect(() => {
    providersRef.current = providers;
  }, [providers]);
  const current = useCallback(
    (id: AgentLaunchTarget): ProviderMock | undefined => providersRef.current.find(p => p.id === id),
    [],
  );

  const update = useCallback((id: AgentLaunchTarget, fn: (p: ProviderMock) => ProviderMock) => {
    setProviders(ps => ps.map(p => (p.id === id ? fn(p) : p)));
  }, []);

  const updateRuntime = useCallback(
    (id: AgentLaunchTarget, fn: (r: RuntimeState) => RuntimeState) => {
      update(id, p => (p.runtime === undefined ? p : { ...p, runtime: fn(p.runtime) }));
    },
    [update],
  );

  const probeAuth = useCallback(
    (id: AgentLaunchTarget, result: ProviderMock['auth']) => {
      update(id, p => ({ ...p, auth: 'Checking' }));
      later(900, () => {
        update(id, p => ({ ...p, auth: result }));
        setCheckedAt(Date.now());
      });
    },
    [update],
  );

  const installRuntime = useCallback(
    (id: AgentLaunchTarget) => {
      const version = PROVIDER_META[id].latestVersion ?? '0.0.0';
      updateRuntime(id, r => ({ ...r, job: { _tag: 'Resolving' } }));
      later(700, () => {
        updateRuntime(id, r => ({ ...r, job: { _tag: 'Installing', progress: 0, version } }));
        const tick = (progress: number): void => {
          if (progress < 1) {
            updateRuntime(id, r => ({ ...r, job: { _tag: 'Installing', progress, version } }));
            later(220, () => {
              tick(progress + 0.1);
            });
            return;
          }
          const prev = current(id);
          if (prev?.runtime === undefined) {
            return;
          }
          const failure = prev.failNextInstall;
          if (failure !== undefined) {
            update(id, p => ({
              ...p,
              failNextInstall: undefined,
              runtime: p.runtime === undefined ? undefined : { ...p.runtime, job: { _tag: 'Failed', ...failure } },
            }));
            return;
          }
          updateRuntime(id, r => ({
            active: version,
            installed: r.installed.includes(version) ? r.installed : [...r.installed, version],
            job: { _tag: 'Idle' },
            latest: { _tag: 'UpToDate' },
          }));
          probeAuth(id, prev.auth === 'SignedIn' ? 'SignedIn' : prev.probeResult);
        };
        tick(0.05);
      });
    },
    [current, probeAuth, update, updateRuntime],
  );

  const checkLatest = useCallback(
    (id: AgentLaunchTarget) => {
      updateRuntime(id, r => ({ ...r, latest: { _tag: 'Checking' } }));
      later(900, () => {
        const latest = PROVIDER_META[id].latestVersion;
        updateRuntime(id, r => ({
          ...r,
          latest:
            latest === undefined || r.installed.includes(latest)
              ? { _tag: 'UpToDate' }
              : { _tag: 'Available', version: latest },
        }));
      });
    },
    [updateRuntime],
  );

  /** Simulates "user fixed it outside the app": missing CLI → found, CLI sign-in → signed in. */
  const recheck = useCallback(
    (id: AgentLaunchTarget) => {
      const prev = current(id);
      if (prev === undefined) {
        return;
      }
      const meta = PROVIDER_META[id];
      if (prev.cli._tag === 'Missing') {
        update(id, p => ({
          ...p,
          cli: { _tag: 'Found', path: `/usr/local/bin/${meta.cliName ?? ''}`, version: '1.0.0' },
        }));
      }
      if (prev.runtime === undefined || prev.runtime.active !== undefined) {
        const fixedOutside = prev.auth === 'NotSignedIn' && meta.signIn._tag === 'Cli';
        probeAuth(id, fixedOutside || prev.auth === 'SignedIn' ? 'SignedIn' : prev.probeResult);
      }
      setCheckedAt(Date.now());
    },
    [current, probeAuth, update],
  );

  const recheckAll = useCallback(() => {
    for (const p of providersRef.current) {
      if (p.enabled && p.cli._tag !== 'Missing' && (p.runtime === undefined || p.runtime.active !== undefined)) {
        probeAuth(p.id, p.auth === 'SignedIn' || p.auth === 'NotSignedIn' ? p.auth : p.probeResult);
      }
    }
    setCheckedAt(Date.now());
  }, [probeAuth]);

  const signIn = useCallback(
    (id: AgentLaunchTarget) => {
      update(id, p => ({ ...p, auth: 'SigningIn' }));
      later(2500, () => {
        update(id, p => ({ ...p, auth: 'SignedIn' }));
      });
    },
    [update],
  );

  const setActiveVersion = useCallback(
    (id: AgentLaunchTarget, version: string) => {
      updateRuntime(id, r => ({ ...r, active: version }));
    },
    [updateRuntime],
  );

  const removeVersion = useCallback(
    (id: AgentLaunchTarget, version: string) => {
      updateRuntime(id, r => {
        const installed = r.installed.filter(v => v !== version);
        return {
          ...r,
          active: r.active === version ? installed.at(-1) : r.active,
          installed,
          latest: { _tag: 'Idle' },
        };
      });
    },
    [updateRuntime],
  );

  const seedFirstRunDefaults = useCallback(() => {
    if (seeded) {
      return;
    }
    setSeeded(true);
    setProviders(ps => ps.map(p => ({ ...p, enabled: firstRunEnabled(p) })));
    // Probe whatever got turned on and is already launchable.
    for (const p of providersRef.current) {
      if (firstRunEnabled(p) && (p.runtime === undefined || p.runtime.active !== undefined)) {
        probeAuth(p.id, p.probeResult);
      }
    }
    setCheckedAt(Date.now());
  }, [probeAuth, seeded]);

  const setEnabled = useCallback(
    (id: AgentLaunchTarget, enabled: boolean) => {
      const prev = current(id);
      update(id, p => ({ ...p, enabled }));
      // Turning on re-probes sign-in when the provider is already launchable.
      if (
        enabled &&
        prev !== undefined &&
        prev.cli._tag !== 'Missing' &&
        (prev.runtime === undefined || prev.runtime.active !== undefined)
      ) {
        probeAuth(id, prev.auth === 'SignedIn' || prev.auth === 'NotSignedIn' ? prev.auth : prev.probeResult);
      }
    },
    [current, probeAuth, update],
  );

  const store = useMemo<ProvidersProtoStore>(
    () => ({
      checkLatest,
      checkedAt,
      installRuntime,
      providers,
      recheck,
      recheckAll,
      removeVersion,
      seedFirstRunDefaults,
      seeded,
      setActiveVersion,
      setEnabled,
      setShowOnStartup,
      showOnStartup,
      signIn,
    }),
    [
      checkLatest,
      checkedAt,
      installRuntime,
      providers,
      recheck,
      recheckAll,
      removeVersion,
      seedFirstRunDefaults,
      seeded,
      setActiveVersion,
      setEnabled,
      showOnStartup,
      signIn,
    ],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};
