/**
 * Provider runtime / requirements atoms and jobs: Check for latest, Download, Install, Remove, Enable / Disable,
 * Recheck. Jobs keep per-provider busy / error state. Check and Download never touch the running provider;
 * Install, Remove, Disable and Recheck stop it (the UI warns first when this instance has live sessions).
 */
import type { ProviderDistribution } from '@lib/ao-home';
import { Cause, Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { findExecutableOnPath } from '../host/findExecutableOnPath.ts';
import {
  activateDownloadedRuntime,
  deactivateRuntime,
  downloadProviderRuntime,
  isManagedProvider,
  purgeAllRuntimes,
  purgeSupersededRuntimes,
  readRuntimeSnapshot,
  resolveLatestRuntime,
} from '../host/providerRuntime.ts';
import type { RuntimeSnapshot } from '../host/providerRuntime.ts';
import { authFromHarness, PROVIDER_META } from '../host/providerView.ts';
import type { CliState, LatestCheck, ProviderView, RuntimeJob } from '../host/providerView.ts';

import {
  backendDesiredStateAtom,
  backendHarnessStateAtom,
  enabledLaunchTargetsAtom,
  providerEnabledMapAtom,
  providerJobAtom,
} from './backendState.atoms.ts';
import type { createHarnessAtoms } from './harness.atoms.ts';
import { unwrapUserSettings } from './userSettings/userSettings.atoms.ts';
import type { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';

type HarnessAtoms = ReturnType<typeof createHarnessAtoms>;
type UserSettingsAtoms = ReturnType<typeof createUserSettingsAtoms>;

/** What we know about a provider's requirements on disk / PATH. `loaded` is false until the first refresh. */
export type ProviderRuntimeInfo = {
  readonly cli: CliState;
  readonly documentError: string | undefined;
  readonly loaded: boolean;
  readonly snapshot: RuntimeSnapshot | undefined;
};

const initialInfo = (launchTarget: AgentLaunchTarget): ProviderRuntimeInfo => ({
  cli: PROVIDER_META[launchTarget].cliName === undefined ? { _tag: 'NotRequired' } : { _tag: 'Missing' },
  documentError: undefined,
  loaded: false,
  snapshot: undefined,
});

const describeFailure = (cause: Cause.Cause<unknown>): { readonly detail: string; readonly message: string } => {
  const detail = Cause.pretty(cause);
  const first = detail.split('\n')[0] ?? detail;
  return { detail, message: first.replace(/^\w*Error:\s*/, '') };
};

export const createProvidersAtoms = (
  runtime: HostRuntimeBag,
  harness: HarnessAtoms,
  userSettings: Pick<UserSettingsAtoms, 'userSettingsAtom'>,
) => {
  const { atomRuntime } = runtime;
  const { userSettingsAtom } = userSettings;

  const providerRuntimeInfoAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    Atom.make<ProviderRuntimeInfo>(initialInfo(launchTarget)).pipe(
      Atom.withLabel(`providerRuntimeInfo:${launchTarget}`),
      Atom.keepAlive,
    ),
  );

  const providerLatestAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    Atom.make<LatestCheck>({ _tag: 'Idle' }).pipe(Atom.withLabel(`providerLatest:${launchTarget}`), Atom.keepAlive),
  );

  /** Resolved descriptor from the last Check; Download reuses it so the selected version is never re-resolved. */
  const providerLatestDistributionAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    Atom.make<ProviderDistribution | undefined>(undefined).pipe(
      Atom.withLabel(`providerLatestDistribution:${launchTarget}`),
      Atom.keepAlive,
    ),
  );

  const liveSessionCountAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    Atom.make(
      get =>
        Object.values(get(backendHarnessStateAtom(launchTarget)).sessions).filter(
          session => session.status === 'active' || session.status === 'activating',
        ).length,
    ).pipe(Atom.keepAlive),
  );

  const providerViewAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    Atom.make((get): ProviderView => {
      const info = get(providerRuntimeInfoAtom(launchTarget));
      const harnessState = get(backendHarnessStateAtom(launchTarget));
      const { auth, harnessError } = authFromHarness(harnessState.phase, harnessState.error);
      const managed = PROVIDER_META[launchTarget].runtimeKind !== undefined;
      return {
        auth,
        cli: info.cli,
        enabled: get(enabledLaunchTargetsAtom).includes(launchTarget),
        harnessError,
        id: launchTarget,
        liveSessions: get(liveSessionCountAtom(launchTarget)),
        runtime: managed
          ? {
              active: info.snapshot?.active,
              cleanupFailures: info.snapshot?.cleanupFailures ?? [],
              documentError: info.documentError,
              downloaded: info.snapshot?.downloaded ?? [],
              job: get(providerJobAtom(launchTarget)),
              latest: get(providerLatestAtom(launchTarget)),
            }
          : undefined,
      };
    }).pipe(Atom.keepAlive),
  );

  /** Every provider in this build (enabled or not) for Settings and the startup modal. */
  const providerViewsAtom = Atom.make(get =>
    MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => get(providerViewAtom(launchTarget))),
  ).pipe(Atom.keepAlive);

  const showProvidersOnStartupAtom = Atom.writable(
    get => unwrapUserSettings(get(userSettingsAtom)).showProvidersOnStartup !== false,
    (ctx, value: boolean) => {
      ctx.set(userSettingsAtom, { ...unwrapUserSettings(ctx.get(userSettingsAtom)), showProvidersOnStartup: value });
    },
  ).pipe(Atom.keepAlive);

  const setJob = (get: Atom.FnContext, launchTarget: AgentLaunchTarget, job: RuntimeJob) => {
    get.set(providerJobAtom(launchTarget), job);
  };

  /** Re-read `current.json` and the CLI on PATH. Malformed state is surfaced, never repaired. */
  const refreshProvider = Effect.fnUntraced(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
    const { cliName } = PROVIDER_META[launchTarget];
    const cli: CliState =
      cliName === undefined
        ? { _tag: 'NotRequired' }
        : yield* findExecutableOnPath(cliName).pipe(
            Effect.map((found): CliState =>
              found._tag === 'Some' ? { _tag: 'Found', path: found.value } : { _tag: 'Missing' },
            ),
          );
    if (!isManagedProvider(launchTarget)) {
      get.set(providerRuntimeInfoAtom(launchTarget), {
        cli,
        documentError: undefined,
        loaded: true,
        snapshot: undefined,
      });
      return;
    }
    const snapshot = yield* readRuntimeSnapshot(launchTarget).pipe(Effect.result);
    get.set(
      providerRuntimeInfoAtom(launchTarget),
      snapshot._tag === 'Success'
        ? { cli, documentError: undefined, loaded: true, snapshot: snapshot.success }
        : { cli, documentError: snapshot.failure.message, loaded: true, snapshot: undefined },
    );
  });

  const refreshProviderAtomFn = atomRuntime
    .fn(
      Effect.fn('refreshProviderAtomFn', { root: true })(function* (
        launchTarget: AgentLaunchTarget,
        get: Atom.FnContext,
      ) {
        yield* refreshProvider(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Manual "Check for latest": metadata only, never interrupts the provider or its sessions. */
  const checkLatestAtomFn = atomRuntime
    .fn(
      Effect.fn('checkLatestAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        if (!isManagedProvider(launchTarget)) {
          return;
        }
        get.set(providerLatestAtom(launchTarget), { _tag: 'Checking' });
        const resolved = yield* resolveLatestRuntime(launchTarget).pipe(Effect.result);
        if (resolved._tag === 'Failure') {
          get.set(providerLatestAtom(launchTarget), { _tag: 'Failed', message: resolved.failure.message });
          return;
        }
        const { snapshot } = get(providerRuntimeInfoAtom(launchTarget));
        const have = new Set([snapshot?.active, ...(snapshot?.downloaded ?? [])]);
        get.set(providerLatestDistributionAtom(launchTarget), resolved.success);
        get.set(
          providerLatestAtom(launchTarget),
          have.has(resolved.success.version)
            ? { _tag: 'UpToDate' }
            : { _tag: 'Available', version: resolved.success.version },
        );
      }),
    )
    .pipe(Atom.keepAlive);

  const runJob = <A, E, R>(
    get: Atom.FnContext,
    launchTarget: AgentLaunchTarget,
    start: RuntimeJob,
    work: Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      setJob(get, launchTarget, start);
      const exit = yield* work.pipe(Effect.exit);
      yield* refreshProvider(launchTarget, get).pipe(Effect.ignore);
      if (exit._tag === 'Failure') {
        setJob(get, launchTarget, { _tag: 'Failed', ...describeFailure(exit.cause) });
        return false;
      }
      setJob(get, launchTarget, { _tag: 'Idle' });
      return true;
    });

  /**
   * User-requested Download, in the background: resolves latest when no Check ran, installs into its own directory,
   * and never stops the provider. The first Download activates automatically and then starts the backend once.
   */
  const downloadAtomFn = atomRuntime
    .fn(
      Effect.fn('downloadAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        if (!isManagedProvider(launchTarget)) {
          return;
        }
        const outcome = { activated: false };
        const ok = yield* runJob(
          get,
          launchTarget,
          { _tag: 'Downloading', version: get(providerLatestAtom(launchTarget))._tag === 'Available' ? 'latest' : '…' },
          Effect.gen(function* () {
            const distribution =
              get(providerLatestDistributionAtom(launchTarget)) ?? (yield* resolveLatestRuntime(launchTarget));
            setJob(get, launchTarget, { _tag: 'Downloading', version: distribution.version });
            const downloaded = yield* downloadProviderRuntime(launchTarget, distribution);
            outcome.activated = downloaded.activated;
            get.set(providerLatestDistributionAtom(launchTarget), undefined);
            get.set(providerLatestAtom(launchTarget), { _tag: 'Idle' });
          }),
        );
        if (ok && outcome.activated && get(enabledLaunchTargetsAtom).includes(launchTarget)) {
          harness.startBackend(launchTarget, get);
        }
      }),
    )
    .pipe(Atom.keepAlive);

  /** Install the downloaded update: publish active, await the local stop, delete superseded dirs, bootstrap once. */
  const installAtomFn = atomRuntime
    .fn(
      Effect.fn('installAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        if (!isManagedProvider(launchTarget)) {
          return;
        }
        const version = get(providerRuntimeInfoAtom(launchTarget)).snapshot?.downloaded.at(-1);
        if (version === undefined) {
          return;
        }
        const ok = yield* runJob(
          get,
          launchTarget,
          { _tag: 'Installing', version },
          Effect.gen(function* () {
            yield* activateDownloadedRuntime(launchTarget, version);
            yield* harness.stopAndReconcile(launchTarget, get);
            yield* purgeSupersededRuntimes(launchTarget);
          }),
        );
        if (ok && get(enabledLaunchTargetsAtom).includes(launchTarget)) {
          harness.startBackend(launchTarget, get);
        }
      }),
    )
    .pipe(Atom.keepAlive);

  /** Remove: no active runtime, stop, delete every runtime directory. Credentials and the enable preference stay. */
  const removeAtomFn = atomRuntime
    .fn(
      Effect.fn('removeAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        if (!isManagedProvider(launchTarget)) {
          return;
        }
        yield* runJob(
          get,
          launchTarget,
          { _tag: 'Removing' },
          Effect.gen(function* () {
            yield* deactivateRuntime(launchTarget);
            yield* harness.stopAndReconcile(launchTarget, get);
            yield* purgeAllRuntimes(launchTarget);
          }),
        );
      }),
    )
    .pipe(Atom.keepAlive);

  /** Enable starts once; Disable awaits the actual process exit and leaves runtime files on disk. */
  const setProviderEnabledAtomFn = atomRuntime
    .fn(
      Effect.fn('setProviderEnabledAtomFn', { root: true })(function* (
        arg: { readonly enabled: boolean; readonly launchTarget: AgentLaunchTarget },
        get: Atom.FnContext,
      ) {
        const { enabled, launchTarget } = arg;
        const settings = unwrapUserSettings(get(userSettingsAtom));
        const next = { ...settings.providerEnabled, [launchTarget]: enabled };
        if (enabled) {
          get.set(backendDesiredStateAtom(launchTarget), 'running');
          get.set(providerEnabledMapAtom, next);
          get.set(userSettingsAtom, { ...settings, providerEnabled: next });
          yield* refreshProvider(launchTarget, get).pipe(Effect.ignore);
          harness.startBackend(launchTarget, get);
          return;
        }
        get.set(backendDesiredStateAtom(launchTarget), 'stopped');
        get.set(providerEnabledMapAtom, next);
        get.set(userSettingsAtom, { ...settings, providerEnabled: next });
        yield* harness.stopAndReconcile(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Disruptive Recheck: re-read requirements, then restart the backend once. */
  const recheckAtomFn = atomRuntime
    .fn(
      Effect.fn('recheckAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        yield* refreshProvider(launchTarget, get).pipe(Effect.ignore);
        if (get(enabledLaunchTargetsAtom).includes(launchTarget)) {
          yield* harness.stopAndReconcile(launchTarget, get);
          harness.startBackend(launchTarget, get);
        }
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    checkLatestAtomFn,
    downloadAtomFn,
    installAtomFn,
    liveSessionCountAtom,
    providerRuntimeInfoAtom,
    providerViewAtom,
    providerViewsAtom,
    recheckAtomFn,
    refreshProviderAtomFn,
    removeAtomFn,
    setProviderEnabledAtomFn,
    showProvidersOnStartupAtom,
  };
};
