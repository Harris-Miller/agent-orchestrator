/** Test-only stand-ins: a fake ACP agent on `sessionRpc`, a disposable registry, and a phase flip. */
import type { SessionSteeringResponse } from '@libs/effect-acp';
import { Deferred, Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { clearConnectedAgent, setConnectedAgent } from '../host/sessionRpc.ts';

import { providerEnabledMapAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

type Registry = AtomRegistry.AtomRegistry;

export const CODEX = 'codex-acp' as const;
export const CLAUDE = 'claude-agent-acp' as const;

export const selectableConfig = {
  configOptions: [
    {
      currentValue: 'gpt',
      id: 'model',
      name: 'Model',
      options: [
        { name: 'gpt', value: 'gpt' },
        { name: 'o1', value: 'o1' },
      ],
      type: 'select' as const,
    },
  ],
};

export type FakeAgentOpts = {
  readonly failDelete?: boolean;
  readonly failNew?: boolean;
  readonly failSetConfig?: boolean;
  /** Runs inside `session/new` before it resolves (a user action mid-Bind). */
  readonly duringNew?: Effect.Effect<void>;
  /** Runs inside `session/set_config_option` before it resolves (a user action mid-Materialize). */
  readonly duringSetConfig?: Effect.Effect<void>;
  /** Runs inside `session/prompt`. */
  readonly duringPrompt?: Effect.Effect<void>;
  /** Runs inside `_session/steering` before it resolves. */
  readonly duringSteering?: Effect.Effect<void>;
  /** `_session/steering` result (default `injected`); `fail` makes the RPC fail. */
  readonly steering?: 'fail' | SessionSteeringResponse['outcome'];
};

/**
 * Fake ACP agent for `launchTarget`. Records `new` (`new:claude`), `close:<id>`, `delete:<id>`, `set:<configId>:<value>`,
 * `prompt:<id>` and `steer:<id>` in `calls`. Session ids are `bound-N` for Codex and `claude-N` for Claude.
 */
export const installFakeAgent = (
  calls: string[],
  opts: FakeAgentOpts = {},
  launchTarget: AgentLaunchTarget = CODEX,
) => {
  const isClaude = launchTarget === CLAUDE;
  let nextId = 1;
  setConnectedAgent(launchTarget, {
    agent: {
      'session/close': ({ sessionId }: { sessionId: string }) => {
        calls.push(`close:${sessionId}`);
        return Effect.void;
      },
      'session/delete': ({ sessionId }: { sessionId: string }) => {
        calls.push(`delete:${sessionId}`);
        return opts.failDelete === true ? Effect.fail('delete-fail') : Effect.void;
      },
      'session/new': () => {
        calls.push(isClaude ? 'new:claude' : 'new');
        if (opts.failNew === true) {
          return Effect.fail('new-fail');
        }
        const sessionId = `${isClaude ? 'claude' : 'bound'}-${nextId}`;
        nextId += 1;
        return Effect.as(opts.duringNew ?? Effect.void, { ...selectableConfig, sessionId });
      },
      'session/prompt': ({ sessionId }: { sessionId: string }) => {
        calls.push(`prompt:${sessionId}`);
        return Effect.as(opts.duringPrompt ?? Effect.void, { stopReason: 'end_turn' as const });
      },
      'session/set_config_option': ({ configId, value }: { configId: string; value: unknown }) => {
        calls.push(`set:${configId}:${String(value)}`);
        if (opts.failSetConfig === true) {
          return Effect.fail('set-fail');
        }
        return Effect.as(opts.duringSetConfig ?? Effect.void, {
          configOptions: [{ ...selectableConfig.configOptions[0], currentValue: value, id: configId }],
        });
      },
    },
    notify: () => Effect.void,
    sessionArchive: () => Effect.fail('no-archive'),
    sessionFork: () => Effect.fail('no-fork'),
    sessionSteering: ({ sessionId }: { sessionId: string }) => {
      calls.push(`steer:${sessionId}`);
      const during = opts.duringSteering ?? Effect.void;
      return opts.steering === 'fail'
        ? Effect.andThen(during, Effect.fail('steer-fail'))
        : Effect.as(during, { outcome: opts.steering ?? 'injected' });
    },
  } as unknown as Parameters<typeof setConnectedAgent>[1]);
};

export const setPhase = (registry: Registry, launchTarget: AgentLaunchTarget, phase: AcpBootstrapPhase) => {
  updateHarnessSnapshot(registry, launchTarget, current => ({ ...current, phase }));
};

/** Registry with Codex and Claude enabled. Fake agents are cleared and the registry disposed when the scope closes. */
export const freshRegistry = Effect.acquireRelease(
  Effect.sync(() => {
    const registry = AtomRegistry.make();
    registry.set(providerEnabledMapAtom, { [CLAUDE]: true, [CODEX]: true });
    return registry;
  }),
  registry =>
    Effect.sync(() => {
      clearConnectedAgent(CODEX);
      clearConnectedAgent(CLAUDE);
      registry.dispose();
    }),
);

/** Run `effect` only the first time it is invoked (e.g. the fake `session/new` fires once per Bind). */
export const onlyFirst = (effect: Effect.Effect<void>): Effect.Effect<void> => {
  let ran = false;
  return Effect.suspend(() => {
    if (ran) {
      return Effect.void;
    }
    ran = true;
    return effect;
  });
};

/** A gate for one `during*` hook: its first run signals `started` and then waits for `release`. */
export const gated = Effect.gen(function* () {
  const started = yield* Deferred.make<undefined>();
  const release = yield* Deferred.make<undefined>();
  return {
    during: onlyFirst(Effect.andThen(Deferred.succeed(started, undefined), Deferred.await(release))),
    release: Deferred.succeed(release, undefined),
    started: Deferred.await(started),
  };
});
