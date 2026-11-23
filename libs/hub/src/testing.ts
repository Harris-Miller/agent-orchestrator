/** Test drivers for the hub's two surfaces: an agent's raw MCP-over-HTTP, and a `/clients` WebSocket client. */
import { Effect } from 'effect';

import { clientsQuery } from './protocol.ts';

export type HubTestMessage = Record<string, unknown>;

export const mcpPost = (
  url: string,
  token: string | undefined,
  body: object,
  options: { readonly headers?: Record<string, string>; readonly sessionId?: string | undefined } = {},
) =>
  Effect.promise(async () => {
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        ...(options.sessionId === undefined ? {} : { 'mcp-session-id': options.sessionId }),
        ...options.headers,
      },
      method: 'POST',
    });
    return { response, text: await response.text() };
  });

type RpcResult = {
  readonly result: {
    readonly content: unknown;
    readonly isError?: boolean;
    readonly protocolVersion: string;
    readonly tools: readonly { name: string }[];
  };
};

/** The JSON-RPC message in either a plain JSON or an SSE (`data: …`) body. */
export const rpcResult = (text: string): RpcResult => {
  const line = text.split('\n').find(l => l.startsWith('data:'));
  return JSON.parse(line === undefined ? text : line.slice('data:'.length)) as RpcResult;
};

/** `initialize` + `notifications/initialized`; the MCP session id and the negotiated protocol version. */
export const mcpInitialize = Effect.fnUntraced(function* (url: string, token: string, protocolVersion = '2025-06-18') {
  const { response, text } = yield* mcpPost(url, token, {
    id: 1,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'test-agent', version: '0' },
      protocolVersion: String(protocolVersion),
    },
  });
  const sessionId = response.headers.get('mcp-session-id') ?? undefined;
  yield* mcpPost(url, token, { jsonrpc: '2.0', method: 'notifications/initialized' }, { sessionId });
  return { negotiated: rpcResult(text).result.protocolVersion, sessionId };
});

export const mcpCallTool = (
  url: string,
  token: string,
  sessionId: string | undefined,
  name: string,
  args: Record<string, unknown>,
) =>
  Effect.map(
    mcpPost(
      url,
      token,
      { id: 3, jsonrpc: '2.0', method: 'tools/call', params: { arguments: args, name } },
      { sessionId },
    ),
    ({ text }) => rpcResult(text).result,
  );

export type TestClient = {
  readonly close: () => void;
  readonly received: HubTestMessage[];
  readonly send: (message: object) => void;
  /** Resolves when the socket closes (either side). */
  readonly waitClosed: Promise<void>;
  readonly waitFor: (predicate: (message: HubTestMessage) => boolean) => Promise<HubTestMessage>;
};

/** The `/clients` query a test client connects with; `appSessionId` is overridable to tell clients apart. */
export const testClientQuery = (appSessionId = 'test-app-session') =>
  clientsQuery({ appSessionId, clientKind: 'test', secret: 'test-secret' });

/** A `/clients` connection (fails if the handshake is refused), closed with the scope. */
export const connectTestClient = (port: number, query = testClientQuery()) =>
  Effect.acquireRelease(
    Effect.promise(
      () =>
        new Promise<TestClient>((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}/clients?${query}`);
          const received: HubTestMessage[] = [];
          const waitClosed = new Promise<void>(done => {
            ws.addEventListener('close', () => {
              done();
            });
          });
          const waiters: { predicate: (m: HubTestMessage) => boolean; resolve: (m: HubTestMessage) => void }[] = [];
          ws.addEventListener('message', event => {
            const message = JSON.parse(String(event.data)) as HubTestMessage;
            received.push(message);
            for (const waiter of waiters.splice(0)) {
              if (waiter.predicate(message)) {
                waiter.resolve(message);
              } else {
                waiters.push(waiter);
              }
            }
          });
          ws.addEventListener('open', () => {
            resolve({
              close: () => {
                ws.close();
              },
              received,
              send: message => {
                ws.send(JSON.stringify(message));
              },
              waitClosed,
              waitFor: predicate =>
                new Promise(done => {
                  const hit = received.find(predicate);
                  if (hit === undefined) {
                    waiters.push({ predicate, resolve: done });
                  } else {
                    done(hit);
                  }
                }),
            });
          });
          ws.addEventListener('error', () => {
            reject(new Error('ws failed to open'));
          });
        }),
    ),
    client =>
      Effect.sync(() => {
        client.close();
      }),
  );

/** Register `token` from `client` and wait for the hub's answer. */
export const registerToken = (client: TestClient, token: string) =>
  Effect.promise(() => {
    client.send({ token, type: 'register' });
    return client.waitFor(m => m.type === 'registered' && m.token === token);
  });
