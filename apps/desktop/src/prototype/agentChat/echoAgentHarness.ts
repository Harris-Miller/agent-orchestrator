/**
 * PROTOTYPE — throwaway harness wiring jsonrpc-echo through connectAcpAgent.
 * Question: can the desktop Agent Harness speak ACP to a spawned echo agent on bootstrap?
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

const makeEchoCommand = (echoMain: string) =>
  ChildProcess.make('bun', ['run', echoMain], {
    extendEnv: true,
    stderr: 'inherit',
    stdin: 'pipe',
    stdout: 'pipe',
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

/** Spawns jsonrpc-echo, initializes ACP, and opens a session. Blocks until interrupted. */
export const startEchoHarness = (handlers: {
  onReady: (sessionId: string, agent: EchoAgentHandle) => void;
  onRpcMessage: (direction: RpcWireEntry['direction'], message: unknown) => void;
  onSessionUpdate: (update: unknown) => void;
  onStatus: (status: EchoHarnessStatus, error?: string) => void;
}) =>
  Effect.gen(function* () {
    handlers.onStatus('connecting');

    const echoMain = yield* resolveEchoMain();
    const { agent } = yield* connectAcpAgent(makeEchoCommand(echoMain), makeClientHandlers(handlers.onSessionUpdate), {
      wireTap: {
        onMessage: handlers.onRpcMessage,
      },
    });

    yield* agent.initialize({ protocolVersion: 1 });
    const session = yield* agent['session/new']({ cwd: '.', mcpServers: [] });

    handlers.onReady(session.sessionId, agent);
    handlers.onStatus('ready');

    return yield* Effect.never;
  }).pipe(Effect.scoped, Effect.provide(TauriServicesLive));

export const sendEchoPrompt = (agent: EchoAgentHandle, sessionId: string, text: string) =>
  agent['session/prompt']({
    prompt: [{ text, type: 'text' }],
    sessionId,
  }).pipe(Effect.provide(TauriServicesLive));
