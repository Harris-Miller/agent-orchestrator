import { assert, describe, it } from '@effect/vitest';
import { PROVIDER_NPM_PACKAGES } from '@lib/hoa-home';
import { Deferred, Effect, Layer, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';

import { mockHostLayer } from './mockHostLayer.testing.ts';
import { createProvidersAtoms } from './providers.atoms.ts';

/** `npm view <pkg>@latest version` answers `2.0.0`; Claude's answer waits for `claudeGate`. */
const npmViewSpawner = (claudeGate: Deferred.Deferred<boolean>) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(command => {
      const { args } = command as unknown as { readonly args: readonly string[] };
      const isClaude = args[1] === `${PROVIDER_NPM_PACKAGES['claude-agent-acp']}@latest`;
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.as(isClaude ? Deferred.await(claudeGate) : Effect.void, ChildProcessSpawner.ExitCode(0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode('2.0.0\n')),
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );

/** Poll on wall-clock time: the npm capture drains on a real timer. */
const wallSleep = Effect.promise(
  () =>
    new Promise<void>(resolve => {
      setTimeout(resolve, 20);
    }),
);

const waitFor = (check: () => boolean) =>
  Effect.gen(function* () {
    for (let tries = 0; tries < 100 && !check(); tries += 1) {
      yield* wallSleep;
    }
  });

describe('provider action atoms', () => {
  it.effect("an action for one provider does not interrupt another provider's in-flight action", () =>
    Effect.gen(function* () {
      const claudeGate = yield* Deferred.make<boolean>();
      const runtime = createHostRuntime(Layer.merge(mockHostLayer, npmViewSpawner(claudeGate)));
      // Check for latest touches neither the harness nor user settings.
      const atoms = createProvidersAtoms(runtime, {} as never, { userSettingsAtom: Atom.make(undefined) as never });
      const registry = AtomRegistry.make();
      const latest = (launchTarget: 'claude-agent-acp' | 'codex-acp') =>
        registry.get(atoms.providerViewAtom(launchTarget)).runtime?.latest;

      registry.set(atoms.checkLatestAtomFn('claude-agent-acp'), 'claude-agent-acp');
      assert.deepStrictEqual(latest('claude-agent-acp'), { _tag: 'Checking' });

      registry.set(atoms.checkLatestAtomFn('codex-acp'), 'codex-acp');
      yield* waitFor(() => latest('codex-acp')?._tag === 'Available');
      assert.deepStrictEqual(latest('codex-acp'), { _tag: 'Available', version: '2.0.0' });
      assert.deepStrictEqual(latest('claude-agent-acp'), { _tag: 'Checking' });

      yield* Deferred.succeed(claudeGate, true);
      yield* waitFor(() => latest('claude-agent-acp')?._tag === 'Available');
      assert.deepStrictEqual(latest('claude-agent-acp'), { _tag: 'Available', version: '2.0.0' });
    }),
  );
});
