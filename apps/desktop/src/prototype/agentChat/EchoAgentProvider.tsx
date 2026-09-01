/**
 * PROTOTYPE — React bridge for the jsonrpc-echo ACP harness.
 */
import { Effect, Fiber } from 'effect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { sendEchoPrompt, startEchoHarness } from './echoAgentHarness.ts';
import type { EchoAgentHandle, EchoHarnessSnapshot } from './echoAgentHarness.ts';
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
  status: 'idle',
});

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};

export const EchoAgentProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<EchoHarnessSnapshot>(initialSnapshot);
  const agentRef = useRef<EchoAgentHandle | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const chatAccumulatorRef = useRef(emptyChatAccumulator());

  useEffect(() => {
    chatAccumulatorRef.current = emptyChatAccumulator();

    const syncChatItems = () => {
      setSnapshot(current => ({
        ...current,
        chatItems: chatItemsFromAccumulator(chatAccumulatorRef.current),
      }));
    };

    const program = startEchoHarness({
      onReady: (sessionId, agent) => {
        sessionIdRef.current = sessionId;
        agentRef.current = agent;
        setSnapshot(current => ({
          ...current,
          sessionId,
        }));
      },
      onRpcMessage: (direction, message) => {
        setSnapshot(current => ({
          ...current,
          rpcCalls: [...current.rpcCalls, { direction, id: crypto.randomUUID(), message }],
        }));
      },
      onSessionUpdate: update => {
        chatAccumulatorRef.current = reduceSessionUpdate(chatAccumulatorRef.current, update);
        syncChatItems();
      },
      onStatus: (status, error) => {
        setSnapshot(current => ({
          ...current,
          error,
          status,
        }));
      },
    }).pipe(
      Effect.catch(error =>
        Effect.sync(() => {
          setSnapshot(current => ({
            ...current,
            error: formatError(error),
            status: 'error',
          }));
        }),
      ),
    );

    const fiber = Effect.runFork(program);

    return () => {
      Effect.runPromise(Fiber.interrupt(fiber)).catch(() => undefined);
      agentRef.current = null;
      sessionIdRef.current = undefined;
    };
  }, []);

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
      sendMessage,
      snapshot,
    }),
    [sendMessage, snapshot],
  );

  return <EchoAgentContext.Provider value={value}>{children}</EchoAgentContext.Provider>;
};
