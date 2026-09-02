/**
 * PROTOTYPE — throwaway harness wiring ACP agents through connectAcpAgent.
 * Backends: jsonrpc-echo (local dev), codex-acp, claude-agent-acp (global bins).
 */
import { OS } from '@lib/context-services';
import { ClientRpcs, connectAcpAgent } from '@libs/effect-acp';
import type { AcpAgentConnection } from '@libs/effect-acp';
import { Deferred, Effect, Exit, Ref } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcess } from 'effect/unstable/process';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';

import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AvailableCommand, ChatItem } from './sessionUpdateReducer.ts';
import {
  appendUserChatMessage,
  chatItemsFromAccumulator,
  emptyChatAccumulator,
  parseAvailableCommands,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';

export type AcpAgentBackend = 'claude-agent-acp' | 'codex-acp' | 'echo';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const echoEntrySegments = ['jsonrpc-echo', 'src', 'main.ts'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};

/** Walk up from host cwd until jsonrpc-echo's entry file is found (sibling or under apps/). */
const resolveEchoMain = Effect.fn('resolveEchoMain')(function* () {
  const os = yield* OS;
  const path = yield* Path;
  const fs = yield* FileSystem;

  let dir = os.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    const direct = path.join(dir, ...echoEntrySegments);
    if (yield* fs.exists(direct)) {
      return direct;
    }

    const underApps = path.join(dir, 'apps', ...echoEntrySegments);
    if (yield* fs.exists(underApps)) {
      return underApps;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return yield* PlatformError.badArgument({
    description: `jsonrpc-echo entry not found from host cwd ${os.cwd()}`,
    method: 'resolveEchoMain',
    module: 'AgentHarness',
  });
});

const makeAgentCommand = Effect.fn('makeAgentCommand')(function* (backend: AcpAgentBackend) {
  switch (backend) {
    case 'claude-agent-acp':
      return ChildProcess.make('claude-agent-acp', [], pipedSpawnOptions);
    case 'codex-acp':
      return ChildProcess.make('codex-acp', [], pipedSpawnOptions);
    case 'echo': {
      const echoMain = yield* resolveEchoMain();
      return ChildProcess.make('bun', ['run', echoMain], pipedSpawnOptions);
    }
  }
});

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
};

export type AgentHandle = AcpAgentConnection['agent'];

export type AgentSessionHandle = {
  readonly agent: AgentHandle;
  readonly sessionId: string;
};

export type BackendHarnessCallbacks = {
  readonly onChatItems: (chatItems: readonly ChatItem[]) => void;
  readonly onCommandsReady: (commands: readonly AvailableCommand[]) => void;
  readonly onInitializeResult: (result: unknown) => void;
  readonly onPhase: (phase: AcpBootstrapPhase, error?: string) => void;
  readonly onRpcMessage: (direction: RpcWireEntry['direction'], message: unknown) => void;
  readonly onSessionNewResult: (result: unknown, sessionId: string, agent: AgentHandle) => void;
};

const agentHandles = new Map<AcpAgentBackend, AgentSessionHandle>();
const chatAccumulators = new Map<AcpAgentBackend, ReturnType<typeof emptyChatAccumulator>>();
const stoppedRefs = new Map<AcpAgentBackend, Ref.Ref<boolean>>();

const getStoppedRef = (backend: AcpAgentBackend): Ref.Ref<boolean> => {
  const existing = stoppedRefs.get(backend);
  if (existing !== undefined) {
    return existing;
  }

  const created = Ref.makeUnsafe(false);
  stoppedRefs.set(backend, created);
  return created;
};

export const getAgentSessionHandle = (backend: AcpAgentBackend): AgentSessionHandle | undefined =>
  agentHandles.get(backend);

export const resetBackendHarnessState = (backend: AcpAgentBackend): void => {
  agentHandles.delete(backend);
  chatAccumulators.set(backend, emptyChatAccumulator());
};

export const appendBackendUserChatItem = (backend: AcpAgentBackend, text: string): readonly ChatItem[] => {
  const accumulator = chatAccumulators.get(backend) ?? emptyChatAccumulator();
  const next = appendUserChatMessage(accumulator, text);
  chatAccumulators.set(backend, next);
  return chatItemsFromAccumulator(next);
};

const reduceBackendSessionUpdate = (backend: AcpAgentBackend, update: unknown): readonly ChatItem[] => {
  const accumulator = chatAccumulators.get(backend) ?? emptyChatAccumulator();
  const next = reduceSessionUpdate(accumulator, update);
  chatAccumulators.set(backend, next);
  return chatItemsFromAccumulator(next);
};

const makeClientHandlers = (onSessionUpdate: (update: unknown) => void) =>
  ClientRpcs.toLayer(
    Effect.succeed({
      'elicitation/complete': () => Effect.void,
      'elicitation/create': () => Effect.succeed({}),
      'fs/read_text_file': () => Effect.succeed({ content: '' }),
      'fs/write_text_file': () => Effect.succeed({}),
      'session/request_permission': () => Effect.succeed({ outcome: { outcome: 'cancelled' as const } }),
      'session/update': payload =>
        Effect.sync(() => {
          onSessionUpdate(payload.update);
        }),
      'terminal/create': () => Effect.succeed({ terminalId: 'prototype-terminal' }),
      'terminal/kill': () => Effect.succeed({}),
      'terminal/output': () => Effect.succeed({ output: '', truncated: false }),
      'terminal/release': () => Effect.succeed({}),
      'terminal/wait_for_exit': () => Effect.succeed({ exitCode: 0, signal: null }),
    }),
  );

const bootstrapOnce = (backend: AcpAgentBackend, handlers: BackendHarnessCallbacks) =>
  Effect.gen(function* () {
    const os = yield* OS;
    handlers.onPhase('connecting');
    chatAccumulators.set(backend, emptyChatAccumulator());

    const commandsDeferred = yield* Deferred.make<readonly AvailableCommand[]>();
    let commandsSent = false;

    const command = yield* makeAgentCommand(backend);
    const connection = yield* connectAcpAgent(
      command,
      makeClientHandlers(update => {
        const chatItems = reduceBackendSessionUpdate(backend, update);
        handlers.onChatItems(chatItems);

        if (isRecord(update) && update.sessionUpdate === 'available_commands_update' && !commandsSent) {
          const commands = parseAvailableCommands(update.availableCommands);
          commandsSent = true;
          handlers.onCommandsReady(commands);
          Deferred.doneUnsafe(commandsDeferred, Effect.succeed(commands));
        }
      }),
      {
        wireTap: {
          onMessage: handlers.onRpcMessage,
        },
      },
    );

    const { agent } = connection;
    const initializeResult = yield* agent.initialize({ protocolVersion: 1 });
    handlers.onInitializeResult(initializeResult);
    handlers.onPhase('initialized');

    const session = yield* agent['session/new']({
      cwd: backend === 'echo' ? '.' : os.cwd(),
      mcpServers: [],
    });

    agentHandles.set(backend, { agent, sessionId: session.sessionId });
    handlers.onSessionNewResult(session, session.sessionId, agent);
    handlers.onPhase('session_open');

    yield* Deferred.await(commandsDeferred);
    handlers.onPhase('ready');

    return yield* Effect.never;
  });

/** Spawns an ACP agent, bootstraps a session, and blocks until interrupted. Retries on failure. */
export const runBackendHarness = (backend: AcpAgentBackend, handlers: BackendHarnessCallbacks) =>
  Effect.gen(function* () {
    const stoppedRef = getStoppedRef(backend);
    yield* Ref.set(stoppedRef, false);

    while (!(yield* Ref.get(stoppedRef))) {
      const exit = yield* Effect.exit(bootstrapOnce(backend, handlers));
      if (Exit.isSuccess(exit)) {
        return;
      }

      handlers.onPhase('error', Exit.isFailure(exit) ? formatError(exit.cause) : 'Unknown error');
      if (yield* Ref.get(stoppedRef)) {
        return;
      }

      agentHandles.delete(backend);
      yield* Effect.sleep('1 second');
    }
  }).pipe(Effect.scoped, Effect.provide(TauriServicesLive));

export const stopBackendHarness = (backend: AcpAgentBackend) =>
  Effect.gen(function* () {
    yield* Ref.set(getStoppedRef(backend), true);
    agentHandles.delete(backend);
  });

export const sendPrompt = (agent: AgentHandle, sessionId: string, text: string) =>
  agent['session/prompt']({
    prompt: [{ text, type: 'text' }],
    sessionId,
  }).pipe(Effect.provide(TauriServicesLive));

export const setMode = (agent: AgentHandle, sessionId: string, modeId: string) =>
  agent['session/set_mode']({
    modeId,
    sessionId,
  }).pipe(Effect.provide(TauriServicesLive));

export const setConfigOption = (agent: AgentHandle, sessionId: string, configId: string, value: string) =>
  agent['session/set_config_option']({
    configId,
    sessionId,
    value,
  }).pipe(Effect.provide(TauriServicesLive));
