/**
 * PROTOTYPE — throwaway harness wiring ACP agents through connectAcpAgent.
 * Backends: jsonrpc-echo (local dev), codex-acp, claude-agent-acp (global bins).
 */
import { OS } from '@lib/context-services';
import { ClientRpcs, connectAcpAgent } from '@libs/effect-acp';
import type { AcpAgentConnection } from '@libs/effect-acp';
import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcess } from 'effect/unstable/process';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';

import type { ChatItem } from './sessionUpdateReducer.ts';

export type AcpAgentBackend = 'claude-agent-acp' | 'codex-acp' | 'echo';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

const echoEntrySegments = ['jsonrpc-echo', 'src', 'main.ts'] as const;

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
    module: 'EchoAgentHarness',
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

export type EchoHarnessStatus = 'connecting' | 'error' | 'idle' | 'ready';

export type RpcWireEntry = {
  readonly direction: 'in' | 'out';
  readonly id: string;
  readonly message: unknown;
};

export type EchoHarnessSnapshot = {
  readonly chatItems: readonly ChatItem[];
  readonly error?: string;
  readonly rpcCalls: readonly RpcWireEntry[];
  readonly sessionId?: string;
  readonly status: EchoHarnessStatus;
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

export type EchoAgentHandle = AcpAgentConnection['agent'];

/** Spawns an ACP agent, initializes ACP, and opens a session. Blocks until interrupted. */
export const startEchoHarness = (
  handlers: {
    onConnection?: (connection: AcpAgentConnection) => void;
    onReady: (sessionId: string, agent: EchoAgentHandle) => void;
    onRpcMessage: (direction: RpcWireEntry['direction'], message: unknown) => void;
    onSessionUpdate: (update: unknown) => void;
    onStatus: (status: EchoHarnessStatus, error?: string) => void;
  },
  options?: {
    readonly backend?: AcpAgentBackend;
  },
) =>
  Effect.gen(function* () {
    const backend = options?.backend ?? 'echo';
    handlers.onStatus('connecting');

    const os = yield* OS;
    const command = yield* makeAgentCommand(backend);
    const connection = yield* connectAcpAgent(command, makeClientHandlers(handlers.onSessionUpdate), {
      wireTap: {
        onMessage: handlers.onRpcMessage,
      },
    });
    handlers.onConnection?.(connection);
    const { agent } = connection;

    yield* agent.initialize({ protocolVersion: 1 });
    const session = yield* agent['session/new']({
      cwd: backend === 'echo' ? '.' : os.cwd(),
      mcpServers: [],
    });

    handlers.onReady(session.sessionId, agent);
    handlers.onStatus('ready');

    return yield* Effect.never;
  }).pipe(Effect.scoped, Effect.provide(TauriServicesLive));

export const sendEchoPrompt = (agent: EchoAgentHandle, sessionId: string, text: string) =>
  agent['session/prompt']({
    prompt: [{ text, type: 'text' }],
    sessionId,
  }).pipe(Effect.provide(TauriServicesLive));
