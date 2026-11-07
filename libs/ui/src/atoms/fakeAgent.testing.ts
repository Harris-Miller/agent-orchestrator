/**
 * Test-only stand-ins: a fake ACP agent registered as the Backend connection (through the real
 * `registerBackendConnection`, released with the test's scope), a disposable registry, and a phase flip.
 */
import type { SessionSteeringResponse, StopReason } from '@libs/effect-acp';
import { Deferred, Effect } from 'effect';
import type { Scope } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { BackendConnectionReports } from '../host/sessionRpc.ts';
import { registerBackendConnection } from '../host/sessionRpc.ts';

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
  /** `session/prompt` stop reason (default `end_turn`); `fail` makes the RPC fail after `duringPrompt`. */
  readonly prompt?: 'fail' | StopReason;
  /** Runs inside `_session/steering` before it resolves. */
  readonly duringSteering?: Effect.Effect<void>;
  /** `_session/steering` result (default `injected`); `fail` makes the RPC fail. */
  readonly steering?: 'fail' | SessionSteeringResponse['outcome'];
};

type FakeConnection = Parameters<typeof registerBackendConnection>[1];

const noReports: BackendConnectionReports = {
  onConfigIndexEvent: () => undefined,
  onConnectionLost: () => undefined,
};

/**
 * Register a hand-rolled partial connection for `launchTarget` until the current scope closes. Pass the Harness event
 * fold as `reports` to see Connection lost when the scope closes; the default reports ignore everything.
 */
export const connectFakeAgent = (
  launchTarget: AgentLaunchTarget,
  partial: object,
  reports: BackendConnectionReports = noReports,
): Effect.Effect<void, never, Scope.Scope> =>
  registerBackendConnection(launchTarget, partial as FakeConnection, reports);

/**
 * Fake ACP agent for `launchTarget`, registered until the current scope closes. Records `new` (`new:claude`), `close:<id>`, `delete:<id>`, `set:<configId>:<value>`,
 * `prompt:<id>`, `steer:<id>` and `cancel:<id>` (the `session/cancel` notification) in `calls`. Session ids are `bound-N` for Codex and `claude-N` for Claude.
 */
export const installFakeAgent = (
  calls: string[],
  opts: FakeAgentOpts = {},
  launchTarget: AgentLaunchTarget = CODEX,
) => {
  const isClaude = launchTarget === CLAUDE;
  let nextId = 1;
  return connectFakeAgent(launchTarget, {
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
        const during = opts.duringPrompt ?? Effect.void;
        return opts.prompt === 'fail'
          ? Effect.andThen(during, Effect.fail('prompt-fail'))
          : Effect.as(during, { stopReason: opts.prompt ?? 'end_turn' });
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
    notify: (method: string, params: { sessionId?: string }) => {
      if (method === 'session/cancel') {
        calls.push(`cancel:${params.sessionId}`);
      }
      return Effect.void;
    },
    sessionArchive: () => Effect.fail('no-archive'),
    sessionFork: () => Effect.fail('no-fork'),
    sessionSteering: ({ sessionId }: { sessionId: string }) => {
      calls.push(`steer:${sessionId}`);
      const during = opts.duringSteering ?? Effect.void;
      return opts.steering === 'fail'
        ? Effect.andThen(during, Effect.fail('steer-fail'))
        : Effect.as(during, { outcome: opts.steering ?? 'injected' });
    },
  });
};

export const setPhase = (registry: Registry, launchTarget: AgentLaunchTarget, phase: AcpBootstrapPhase) => {
  updateHarnessSnapshot(registry, launchTarget, current => ({ ...current, phase }));
};

/** Registry with Codex and Claude enabled, disposed when the scope closes. */
export const freshRegistry = Effect.acquireRelease(
  Effect.sync(() => {
    const registry = AtomRegistry.make();
    registry.set(providerEnabledMapAtom, { [CLAUDE]: true, [CODEX]: true });
    return registry;
  }),
  registry =>
    Effect.sync(() => {
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
