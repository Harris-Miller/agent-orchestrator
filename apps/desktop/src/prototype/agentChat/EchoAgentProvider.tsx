/**
 * PROTOTYPE — React bridge for the ACP agent harness.
 */
import type { AcpAgentConnection } from '@libs/effect-acp';
import { Effect, Fiber } from 'effect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';

import { sendEchoPrompt, startEchoHarness } from './echoAgentHarness.ts';
import type { AcpAgentBackend, EchoAgentHandle, EchoHarnessSnapshot } from './echoAgentHarness.ts';
import {
  appendUserChatMessage,
  chatItemsFromAccumulator,
  emptyChatAccumulator,
  reduceSessionUpdate,
} from './sessionUpdateReducer.ts';
import { EchoAgentContext } from './useEchoAgent.ts';

const initialSnapshot = (): EchoHarnessSnapshot => ({
  chatItems: [],
  rpcCalls: [],
  status: 'connecting',
});

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};

const killConnection = (connection: AcpAgentConnection) =>
  connection.handle.kill().pipe(Effect.orDie, Effect.provide(TauriServicesLive));

export const EchoAgentProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [backend, setBackend] = useState<AcpAgentBackend>('echo');
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const agentRef = useRef<EchoAgentHandle | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const chatAccumulatorRef = useRef(emptyChatAccumulator());
  const connectionRef = useRef<AcpAgentConnection | null>(null);
  const fiberRef = useRef<Fiber.Fiber<void, unknown> | null>(null);
  const harnessGenerationRef = useRef(0);
  const shutdownRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const generation = harnessGenerationRef.current + 1;
    harnessGenerationRef.current = generation;
    let cancelled = false;

    chatAccumulatorRef.current = emptyChatAccumulator();

    const isCurrentGeneration = () => !cancelled && harnessGenerationRef.current === generation;

    const syncChatItems = () => {
      if (!isCurrentGeneration()) {
        return;
      }

      setSnapshot(current => ({
        ...current,
        chatItems: chatItemsFromAccumulator(chatAccumulatorRef.current),
      }));
    };

    const program = startEchoHarness(
      {
        onConnection: connection => {
          if (!isCurrentGeneration()) {
            return;
          }

          connectionRef.current = connection;
        },
        onReady: (sessionId, agent) => {
          if (!isCurrentGeneration()) {
            return;
          }

          sessionIdRef.current = sessionId;
          agentRef.current = agent;
          setSnapshot(current => ({
            ...current,
            sessionId,
          }));
        },
        onRpcMessage: (direction, message) => {
          if (!isCurrentGeneration()) {
            return;
          }

          setSnapshot(current => ({
            ...current,
            rpcCalls: [...current.rpcCalls, { direction, id: crypto.randomUUID(), message }],
          }));
        },
        onSessionUpdate: update => {
          if (!isCurrentGeneration()) {
            return;
          }

          chatAccumulatorRef.current = reduceSessionUpdate(chatAccumulatorRef.current, update);
          syncChatItems();
        },
        onStatus: (status, error) => {
          if (!isCurrentGeneration()) {
            return;
          }

          setSnapshot(current => ({
            ...current,
            error,
            status,
          }));
        },
      },
      { backend },
    ).pipe(
      Effect.catch(error =>
        Effect.sync(() => {
          if (!isCurrentGeneration()) {
            return;
          }

          setSnapshot(current => ({
            ...current,
            error: formatError(error),
            status: 'error',
          }));
        }),
      ),
    );

    const runHarness = async () => {
      await shutdownRef.current;
      if (cancelled) {
        return;
      }

      const fiber = Effect.runFork(program);
      fiberRef.current = fiber;

      await Effect.runPromise(Fiber.join(fiber)).catch(() => undefined);
    };

    runHarness().catch(() => undefined);

    return () => {
      cancelled = true;
      agentRef.current = null;
      sessionIdRef.current = undefined;

      const connection = connectionRef.current;
      connectionRef.current = null;

      const fiber = fiberRef.current;
      fiberRef.current = null;

      const shutdown = async () => {
        if (connection !== null) {
          await Effect.runPromise(killConnection(connection)).catch(() => undefined);
        }

        if (fiber !== null) {
          await Effect.runPromise(Fiber.interrupt(fiber)).catch(() => undefined);
        }
      };

      shutdownRef.current = shutdown();
    };
  }, [backend]);

  const changeBackend = useCallback(
    (next: AcpAgentBackend) => {
      if (next === backend) {
        return;
      }

      chatAccumulatorRef.current = emptyChatAccumulator();
      agentRef.current = null;
      sessionIdRef.current = undefined;
      setSnapshot(initialSnapshot());
      setBackend(next);
    },
    [backend, setBackend],
  );

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    const agent = agentRef.current;
    const sessionId = sessionIdRef.current;

    if (trimmed.length === 0 || agent === null || sessionId === undefined) {
      return;
    }

    chatAccumulatorRef.current = appendUserChatMessage(chatAccumulatorRef.current, trimmed);
    setSnapshot(current => ({
      ...current,
      chatItems: chatItemsFromAccumulator(chatAccumulatorRef.current),
    }));

    await Effect.runPromise(sendEchoPrompt(agent, sessionId, trimmed));
  }, []);

  const value = useMemo(
    () => ({
      backend,
      sendMessage,
      setBackend: changeBackend,
      snapshot,
    }),
    [backend, changeBackend, sendMessage, snapshot],
  );

  return <EchoAgentContext.Provider value={value}>{children}</EchoAgentContext.Provider>;
};
