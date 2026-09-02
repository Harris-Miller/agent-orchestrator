/**
 * PROTOTYPE — throwaway harness wiring ACP agents through connectAcpAgent.
 * Backends: jsonrpc-echo (local dev), codex-acp, claude-agent-acp, gemini-cli (global bins).
 */
import { OS } from '@lib/context-services';
import { ClientRpcs, connectAcpAgent } from '@libs/effect-acp';
import type { AcpAgentConnection } from '@libs/effect-acp';
import { Effect, Exit, Ref } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcess } from 'effect/unstable/process';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';
import { isRecord } from '../../utils.ts';

import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { AvailableCommand, ChatItem } from './sessionUpdateReducer.ts';
import {
  appendUserChatMessage,
  chatItemsFromAccumulator,
  emptyChatAccumulator,
  parseAvailableCommands,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';

export type AcpAgentBackend = 'claude-agent-acp' | 'codex-acp' | 'echo' | 'gemini-cli';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const echoEntrySegments = ['jsonrpc-echo', 'src', 'main.ts'] as const;

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
    case 'gemini-cli':
      return ChildProcess.make('gemini', ['--acp'], pipedSpawnOptions);
  }
});

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
};

export type AgentHandle = AcpAgentConnection['agent'];

export type BackendHarnessCallbacks = {
  readonly onCommandsReady: (sessionId: string, commands: readonly AvailableCommand[]) => void;
  readonly onInitializeResult: (result: unknown) => void;
  readonly onPhase: (phase: AcpBootstrapPhase, error?: string) => void;
  readonly onRpcMessage: (direction: RpcWireEntry['direction'], message: unknown) => void;
  readonly onSessionRosterResult: (result: unknown) => void;
  readonly onSessionUpdate: (sessionId: string, chatItems: readonly ChatItem[], update: unknown) => void;
};

const agentHandles = new Map<AcpAgentBackend, AgentHandle>();
const chatAccumulators = new Map<AcpAgentBackend, Map<string, ReturnType<typeof emptyChatAccumulator>>>();
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

const getSessionAccumulators = (backend: AcpAgentBackend): Map<string, ReturnType<typeof emptyChatAccumulator>> => {
  const existing = chatAccumulators.get(backend);
  if (existing !== undefined) {
    return existing;
  }

  const created = new Map<string, ReturnType<typeof emptyChatAccumulator>>();
  chatAccumulators.set(backend, created);
  return created;
};

export const getAgentHandle = (backend: AcpAgentBackend): AgentHandle | undefined => agentHandles.get(backend);

export const resetBackendHarnessState = (backend: AcpAgentBackend): void => {
  agentHandles.delete(backend);
  chatAccumulators.set(backend, new Map());
};

export const appendBackendUserChatItem = (
  backend: AcpAgentBackend,
  sessionId: string,
  text: string,
): readonly ChatItem[] => {
  const sessionAccumulators = getSessionAccumulators(backend);
  const accumulator = sessionAccumulators.get(sessionId) ?? emptyChatAccumulator();
  const next = appendUserChatMessage(accumulator, text);
  sessionAccumulators.set(sessionId, next);
  return chatItemsFromAccumulator(next);
};

const reduceBackendSessionUpdate = (
  backend: AcpAgentBackend,
  sessionId: string,
  update: unknown,
): readonly ChatItem[] => {
  const sessionAccumulators = getSessionAccumulators(backend);
  const accumulator = sessionAccumulators.get(sessionId) ?? emptyChatAccumulator();
  const next = reduceSessionUpdate(accumulator, update);
  sessionAccumulators.set(sessionId, next);
  return chatItemsFromAccumulator(next);
};

const makeClientHandlers = (onSessionUpdate: (sessionId: string, update: unknown) => void) =>
  ClientRpcs.toLayer(
    Effect.succeed({
      'elicitation/complete': () => Effect.void,
      'elicitation/create': () => Effect.succeed({}),
      'fs/read_text_file': () => Effect.succeed({ content: '' }),
      'fs/write_text_file': () => Effect.succeed({}),
      'session/request_permission': () => Effect.succeed({ outcome: { outcome: 'cancelled' as const } }),
      'session/update': payload =>
        Effect.sync(() => {
          onSessionUpdate(payload.sessionId, payload.update);
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
    handlers.onPhase('connecting');
    chatAccumulators.set(backend, new Map());

    const command = yield* makeAgentCommand(backend);
    const connection = yield* connectAcpAgent(
      command,
      makeClientHandlers((sessionId, update) => {
        const chatItems = reduceBackendSessionUpdate(backend, sessionId, update);
        handlers.onSessionUpdate(sessionId, chatItems, update);

        if (isRecord(update) && update.sessionUpdate === 'available_commands_update') {
          const commands = parseAvailableCommands(update.availableCommands);
          handlers.onCommandsReady(sessionId, commands);
        }
      }),
      {
        wireTap: {
          onMessage: handlers.onRpcMessage,
        },
      },
    );

    const { agent } = connection;
    agentHandles.set(backend, agent);

    const initializeResult = yield* agent.initialize({ protocolVersion: 1 });
    handlers.onInitializeResult(initializeResult);
    handlers.onPhase('initialized');

    const listResult = yield* agent['session/list']({});
    handlers.onSessionRosterResult(listResult);
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

const sessionCwd = (backend: AcpAgentBackend) =>
  Effect.gen(function* () {
    const os = yield* OS;
    return backend === 'echo' ? '.' : os.cwd();
  }).pipe(Effect.provide(TauriServicesLive));

export const listSessions = (agent: AgentHandle) => agent['session/list']({}).pipe(Effect.provide(TauriServicesLive));

export const createSession = (agent: AgentHandle, backend: AcpAgentBackend) =>
  Effect.gen(function* () {
    const cwd = yield* sessionCwd(backend);
    return yield* agent['session/new']({ cwd, mcpServers: [] });
  });

export const loadSession = (agent: AgentHandle, backend: AcpAgentBackend, sessionId: string) =>
  Effect.gen(function* () {
    const cwd = yield* sessionCwd(backend);
    return yield* agent['session/load']({ cwd, mcpServers: [], sessionId });
  });

export const resumeSession = (agent: AgentHandle, backend: AcpAgentBackend, sessionId: string) =>
  Effect.gen(function* () {
    const cwd = yield* sessionCwd(backend);
    return yield* agent['session/resume']({ cwd, sessionId });
  });

export const closeSession = (agent: AgentHandle, sessionId: string) =>
  agent['session/close']({ sessionId }).pipe(Effect.provide(TauriServicesLive));

export const deleteSession = (agent: AgentHandle, sessionId: string) =>
  agent['session/delete']({ sessionId }).pipe(Effect.provide(TauriServicesLive));

export const sendPrompt = (agent: AgentHandle, sessionId: string, text: string) =>
  agent['session/prompt']({
    prompt: [{ text, type: 'text' }],
    sessionId,
  }).pipe(Effect.provide(TauriServicesLive));

export const setConfigOption = (agent: AgentHandle, sessionId: string, configId: string, value: string) =>
  agent['session/set_config_option']({
    configId,
    sessionId,
    value,
  }).pipe(Effect.provide(TauriServicesLive));
