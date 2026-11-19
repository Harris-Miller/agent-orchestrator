/**
 * Test-only stand-ins: a fake ACP agent registered as the Backend connection (through the real
 * `registerBackendConnection`, released with the test's scope), a disposable registry, and a phase flip.
 */
import type { SessionSteeringResponse, StopReason } from '@libs/effect-acp';
import { Deferred, Effect } from 'effect';
import type { Scope } from 'effect';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';

import type { AcpBootstrapPhase } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { applyInitializeResult } from '../host/harnessStateTransitions.ts';
import { forgetAllMcpTokens } from '../host/hubSessions.ts';
import { installHub, setHubAvailability } from '../host/hubConnection.ts';
import type { BackendConnectionReports } from '../host/sessionRpc.ts';
import { registerBackendConnection, setBackendMcpHttp } from '../host/sessionRpc.ts';

import { providerBootstrapDoneAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { userSettingsDocumentAtom } from './userSettings/userSettingsDocument.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

export const CODEX = 'codex-acp' as const;
export const CLAUDE = 'claude-agent-acp' as const;

/** The JSON-RPC error response the fake Agent gives for a `reject` option (the Agent refused the request). */
export const REJECTION = {
  code: -32603,
  data: { details: 'Prompt is 120000 characters; the limit is 100000' },
  message: 'Exceeds max character length',
} as const;

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

/** How the fake answers `session/set_config_option`: the canned answer (optionally failing or with a hook), or `setConfig`. */
type FakeSetConfig =
  | {
      /** Runs inside `session/set_config_option` before it resolves (a user action mid-Materialize). */
      readonly duringSetConfig?: Effect.Effect<void>;
      readonly failSetConfig?: boolean;
      readonly rejectSetConfig?: boolean;
      readonly setConfig?: undefined;
    }
  | {
      readonly duringSetConfig?: never;
      readonly failSetConfig?: never;
      readonly rejectSetConfig?: never;
      /** Answers `session/set_config_option` (after recording `set:<id>:<value>`). */
      readonly setConfig: (configId: string, value: unknown) => Effect.Effect<unknown, string>;
    };

export type FakeAgentOpts = FakeSetConfig & {
  readonly failClose?: boolean;
  readonly failDelete?: boolean;
  readonly failLoad?: boolean;
  readonly failNew?: boolean;
  readonly failUnarchive?: boolean;
  /** `session/fork` answers with {@link REJECTION}. */
  readonly rejectFork?: boolean;
  /** Receives what the Backend connection reports (pass the Harness event fold); ignores everything by default. */
  readonly reports?: BackendConnectionReports;
  /** Runs inside `session/load` before it resolves (history replay). */
  readonly duringLoad?: Effect.Effect<void>;
  /** Runs inside `session/new` before it resolves (a user action mid-Bind). */
  readonly duringNew?: Effect.Effect<void>;
  /** Runs inside `session/prompt`. */
  readonly duringPrompt?: Effect.Effect<void>;
  /** Collects the text of each `session/prompt` it receives. */
  readonly promptTexts?: string[];
  /** Record (and by default advertise `mcpCapabilities.http` for) the `mcpServers` each session RPC received into `mcp`. */
  readonly mcp?: { readonly http?: boolean; readonly received: McpReceived[] };
  /** `session/prompt` stop reason (default `end_turn`); `fail` makes the RPC fail after `duringPrompt`; `reject` answers with {@link REJECTION} then. */
  readonly prompt?: 'fail' | 'reject' | StopReason;
  /** `_meta` on the `session/prompt` response (e.g. an AIR `sessionFailure`). */
  readonly promptMeta?: Record<string, unknown>;
  /** Runs inside `_session/steering` before it resolves. */
  readonly duringSteering?: Effect.Effect<void>;
  /** `_session/steering` result (default `injected`); `fail` makes the RPC fail; `reject` answers with {@link REJECTION}. */
  readonly steering?: 'fail' | 'reject' | SessionSteeringResponse['outcome'];
};

/** One session RPC's `mcpServers`, as the fake agent received it. */
export type McpReceived = {
  /** The request's `_meta` (provider options such as Claude's tool pre-approval). */
  readonly meta: unknown;
  readonly rpc: 'fork' | 'load' | 'new' | 'resume';
  readonly servers: readonly unknown[];
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
 * `load:<id>`, `resume:<id>`, `fork:<id>`, `archive:<id>`, `unarchive:<id>`, `rename:<id>`, `prompt:<id>`, `steer:<id>` and `cancel:<id>` (the `session/cancel` notification) in
 * `calls`. Session ids are `bound-N` for Codex and `claude-N` for Claude; a fork is `fork-1`. It answers every RPC it knows whatever it advertises: seed what
 * it advertises with {@link advertise}. `setConfig` replaces the canned `session/set_config_option` answer; `reports` (e.g. the
 * Harness event fold) receives Lazy hydrate and Connection lost.
 */
export const installFakeAgent = (
  calls: string[],
  opts: FakeAgentOpts = {},
  launchTarget: AgentLaunchTarget = CODEX,
) => {
  const isClaude = launchTarget === CLAUDE;
  let nextId = 1;
  return connectFakeAgent(
    launchTarget,
    {
      agent: {
        'session/close': ({ sessionId }: { sessionId: string }) => {
          calls.push(`close:${sessionId}`);
          return opts.failClose === true ? Effect.fail('close-fail') : Effect.void;
        },
        'session/delete': ({ sessionId }: { sessionId: string }) => {
          calls.push(`delete:${sessionId}`);
          return opts.failDelete === true ? Effect.fail('delete-fail') : Effect.void;
        },
        'session/load': ({
          _meta,
          mcpServers,
          sessionId,
        }: {
          _meta?: unknown;
          mcpServers: readonly unknown[];
          sessionId: string;
        }) => {
          calls.push(`load:${sessionId}`);
          opts.mcp?.received.push({ meta: _meta, rpc: 'load', servers: mcpServers });
          return opts.failLoad === true
            ? Effect.fail('load-fail')
            : Effect.as(opts.duringLoad ?? Effect.void, selectableConfig);
        },
        'session/new': ({ _meta, mcpServers }: { _meta?: unknown; mcpServers: readonly unknown[] }) => {
          calls.push(isClaude ? 'new:claude' : 'new');
          opts.mcp?.received.push({ meta: _meta, rpc: 'new', servers: mcpServers });
          if (opts.failNew === true) {
            return Effect.fail('new-fail');
          }
          const sessionId = `${isClaude ? 'claude' : 'bound'}-${nextId}`;
          nextId += 1;
          return Effect.as(opts.duringNew ?? Effect.void, { ...selectableConfig, sessionId });
        },
        'session/prompt': ({
          prompt,
          sessionId,
        }: {
          prompt: readonly { type: string; text?: string }[];
          sessionId: string;
        }) => {
          calls.push(`prompt:${sessionId}`);
          opts.promptTexts?.push(prompt.map(block => block.text ?? '').join(''));
          const during = opts.duringPrompt ?? Effect.void;
          if (opts.prompt === 'reject') {
            return Effect.andThen(during, Effect.fail(REJECTION));
          }
          return opts.prompt === 'fail'
            ? Effect.andThen(during, Effect.fail('prompt-fail'))
            : Effect.as(during, {
                ...(opts.promptMeta === undefined ? {} : { _meta: opts.promptMeta }),
                stopReason: opts.prompt ?? 'end_turn',
              });
        },
        'session/resume': ({
          _meta,
          mcpServers,
          sessionId,
        }: {
          _meta?: unknown;
          mcpServers?: readonly unknown[];
          sessionId: string;
        }) => {
          calls.push(`resume:${sessionId}`);
          opts.mcp?.received.push({ meta: _meta, rpc: 'resume', servers: mcpServers ?? [] });
          return Effect.succeed(selectableConfig);
        },
        'session/set_config_option': ({ configId, value }: { configId: string; value: unknown }) => {
          calls.push(`set:${configId}:${String(value)}`);
          if (opts.setConfig !== undefined) {
            return opts.setConfig(configId, value);
          }
          if (opts.failSetConfig === true) {
            return Effect.fail('set-fail');
          }
          if (opts.rejectSetConfig === true) {
            return Effect.fail(REJECTION);
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
      sessionArchive: ({ sessionId }: { sessionId: string }) => {
        calls.push(`archive:${sessionId}`);
        return Effect.void;
      },
      sessionFork: ({
        _meta,
        mcpServers,
        sessionId,
      }: {
        _meta?: unknown;
        mcpServers: readonly unknown[];
        sessionId: string;
      }) => {
        calls.push(`fork:${sessionId}`);
        opts.mcp?.received.push({ meta: _meta, rpc: 'fork', servers: mcpServers });
        return opts.rejectFork === true
          ? Effect.fail(REJECTION)
          : Effect.succeed({ ...selectableConfig, sessionId: 'fork-1' });
      },
      sessionRename: ({ sessionId }: { sessionId: string }) => {
        calls.push(`rename:${sessionId}`);
        return Effect.void;
      },
      sessionSteering: ({ sessionId }: { sessionId: string }) => {
        calls.push(`steer:${sessionId}`);
        const during = opts.duringSteering ?? Effect.void;
        if (opts.steering === 'reject') {
          return Effect.andThen(during, Effect.fail(REJECTION));
        }
        return opts.steering === 'fail'
          ? Effect.andThen(during, Effect.fail('steer-fail'))
          : Effect.as(during, { outcome: opts.steering ?? 'injected' });
      },
      sessionUnarchive: ({ sessionId }: { sessionId: string }) => {
        calls.push(`unarchive:${sessionId}`);
        // Agent errors reach the Harness as defects, like a real JSON-RPC error.
        return opts.failUnarchive === true ? Effect.die('unarchive-fail') : Effect.void;
      },
    },
    opts.reports,
  ).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        setBackendMcpHttp(launchTarget, opts.mcp !== undefined && opts.mcp.http !== false);
      }),
    ),
  );
};

/**
 * Fake hub connection, available until the scope closes: records `register`, `bind:<launchTarget>:<sessionId>` and
 * `revoke` (tokens are random, so calls name none) into `calls`. `accept: false` makes the hub refuse every credential.
 * On release the hub is unavailable again and every credential and session status is forgotten.
 */
export const installFakeHub = (calls: string[], options: { readonly accept?: boolean } = {}) =>
  Effect.gen(function* () {
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        forgetAllMcpTokens();
        setHubAvailability({ _tag: 'unavailable', reason: 'No hub in this test.' });
      }),
    );
    yield* installHub({
      bind: (_token, launchTarget, sessionId) => Effect.sync(() => calls.push(`bind:${launchTarget}:${sessionId}`)),
      mcpUrl: 'http://hub.test/mcp',
      register: () => Effect.sync(() => calls.push('register') > 0 && options.accept !== false),
      revoke: () => Effect.sync(() => calls.push('revoke')),
    });
    setHubAvailability({ _tag: 'available' });
  });

/** The bearer token in a recorded hub MCP server entry (what the agent would present to the hub). */
export const bearerOf = (servers: readonly unknown[]): string => {
  const [server] = servers as readonly { headers: readonly { value: string }[] }[];
  return server.headers[0].value.replace('Bearer ', '');
};

export const setPhase = (registry: Registry, launchTarget: AgentLaunchTarget, phase: AcpBootstrapPhase) => {
  updateHarnessSnapshot(registry, launchTarget, current => ({ ...current, phase }));
};

/** What the Agent advertises: apply a raw initialize result through the real Harness state transition, then go `ready`. */
export const advertise = (registry: Registry, launchTarget: AgentLaunchTarget, initializeResult: unknown) => {
  updateHarnessSnapshot(registry, launchTarget, current => ({
    ...applyInitializeResult(current, launchTarget, initializeResult),
    phase: 'ready',
  }));
};

/** Enable exactly `launchTargets` through User settings (as after provider bootstrap). */
export const enableProviders = (registry: Registry, launchTargets: readonly AgentLaunchTarget[]) => {
  registry.set(
    userSettingsDocumentAtom,
    AsyncResult.success({ providerEnabled: Object.fromEntries(launchTargets.map(target => [target, true])) }),
  );
  registry.set(providerBootstrapDoneAtom, true);
};

/** Registry with Codex and Claude enabled, disposed when the scope closes. */
export const freshRegistry = Effect.acquireRelease(
  Effect.sync(() => {
    const registry = AtomRegistry.make();
    enableProviders(registry, [CLAUDE, CODEX]);
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
