/**
 * Keep-awake controller: holds the Keep-awake hold while any agent is working and the Keep awake User setting is on.
 * Lives in `@lib/ui` so desktop and VS Code behave identically; only the spawned command is per-OS.
 */
import { Duration, Effect, Stream } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import { holdKeepAwake, hostKeepAwakeHoldCommand } from '../host/keepAwake.ts';
import { anyPromptTurnWorking } from '../host/turnActivity.ts';
import { backendHarnessSnapshotAtom } from './harnessSnapshot.ts';

/** Idle time before the hold is released, so back-to-back turns don't flap the OS assertion. */
const KEEP_AWAKE_GRACE = Duration.seconds(30);

export type KeepAwakeInput = {
  readonly enabled: boolean;
  /** Every mounted Backend harness snapshot. */
  readonly snapshots: readonly BackendHarnessSnapshot[];
};

type Activity = 'disabled' | 'idle' | 'working';

const activity = (input: KeepAwakeInput): Activity => {
  if (!input.enabled) {
    return 'disabled';
  }
  return anyPromptTurnWorking(input.snapshots) ? 'working' : 'idle';
};

/**
 * Hold wanted: working → true now; idle → false after the grace period (cancelled if work resumes); disabled → false
 * now. Each `true` opens a hold until the next `false`, so staying wanted never respawns. Unsupported Hosts do nothing.
 */
export const runKeepAwake = Effect.fn('runKeepAwake')(function* (inputs: Stream.Stream<KeepAwakeInput>) {
  const command = yield* hostKeepAwakeHoldCommand();
  if (command === undefined) {
    yield* Effect.logInfo('Keep-awake unsupported on this platform');
    return;
  }
  yield* inputs.pipe(
    Stream.map(activity),
    Stream.changes,
    Stream.switchMap(next =>
      next === 'idle'
        ? Stream.fromEffect(Effect.as(Effect.sleep(KEEP_AWAKE_GRACE), false))
        : Stream.succeed(next === 'working'),
    ),
    Stream.changes,
    Stream.switchMap(wanted =>
      wanted ? Stream.fromEffect(Effect.scoped(Effect.andThen(holdKeepAwake(command), Effect.never))) : Stream.empty,
    ),
    Stream.runDrain,
  );
});

export const createKeepAwakeAtoms = (
  runtime: HostRuntimeBag['atomRuntime'],
  settings: { readonly keepAwakeEnabledAtom: Atom.Atom<boolean> },
) => {
  const keepAwakeInputAtom = Atom.make((get): KeepAwakeInput => ({
    enabled: get(settings.keepAwakeEnabledAtom),
    snapshots: MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget => get(backendHarnessSnapshotAtom(launchTarget))),
  }));

  return {
    /** Mount for the app's lifetime (`KeepAwakeMount`). */
    keepAwakeAtom: runtime.atom(get => runKeepAwake(get.stream(keepAwakeInputAtom))),
    /** Whether this Host can hold the computer awake (probed once per atom; `runKeepAwake` probes on its own). */
    keepAwakeSupportedAtom: runtime.atom(Effect.map(hostKeepAwakeHoldCommand(), command => command !== undefined)),
  };
};
