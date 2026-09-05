import { assert, describe, it } from '@effect/vitest';

import { routeDecodedMessage } from './AcpConnection.ts';

const noop = (): void => undefined;

describe('routeDecodedMessage', () => {
  it('routes agent responses with a pending client request id to the client', () => {
    const pending = new Set<number | string>(['req-1']);
    const notifications = new Set<number | string>();
    const toClient: unknown[] = [];
    const toServer: unknown[] = [];

    routeDecodedMessage(
      {
        _tag: 'Exit',
        exit: { _tag: 'Success', value: {} },
        requestId: 'req-1',
      },
      pending,
      notifications,
      {
        toClient: message => {
          toClient.push(message);
        },
        toServer: message => {
          toServer.push(message);
        },
      },
    );

    assert.strictEqual(toClient.length, 1);
    assert.strictEqual(toServer.length, 0);
    assert.deepStrictEqual([...pending], []);
  });

  it('clears pending id on Exit but not on Chunk', () => {
    const pending = new Set<number | string>(['req-1']);
    const notifications = new Set<number | string>();

    routeDecodedMessage(
      {
        _tag: 'Chunk',
        requestId: 'req-1',
        values: [],
      },
      pending,
      notifications,
      {
        toClient: noop,
        toServer: noop,
      },
    );

    assert.deepStrictEqual([...pending], ['req-1']);
  });

  it('routes agent-initiated requests to the server handler', () => {
    const pending = new Set<number | string>();
    const notifications = new Set<number | string>();
    const toClient: unknown[] = [];
    const toServer: unknown[] = [];

    routeDecodedMessage(
      {
        _tag: 'Request',
        headers: [],
        id: 'agent-req-1',
        payload: { sessionId: 's1' },
        tag: 'session/request_permission',
      },
      pending,
      notifications,
      {
        toClient: message => {
          toClient.push(message);
        },
        toServer: message => {
          toServer.push(message);
        },
      },
    );

    assert.strictEqual(toClient.length, 0);
    assert.strictEqual(toServer.length, 1);
    assert.strictEqual((toServer[0] as { tag: string }).tag, 'session/request_permission');
  });

  it('tracks id-less agent notifications and routes them to the server', () => {
    const pending = new Set<number | string>();
    const notifications = new Set<number | string>();
    const toServer: unknown[] = [];

    routeDecodedMessage(
      {
        _tag: 'Request',
        headers: [],
        id: '',
        isNotification: true,
        payload: { sessionId: 's1' },
        tag: 'session/update',
      },
      pending,
      notifications,
      {
        toClient: noop,
        toServer: message => {
          toServer.push(message);
        },
      },
    );

    assert.strictEqual(toServer.length, 1);
    assert.deepStrictEqual([...notifications], ['']);
  });

  it('ignores responses for unknown request ids', () => {
    const pending = new Set<number | string>();
    const notifications = new Set<number | string>();
    const toClient: unknown[] = [];

    routeDecodedMessage(
      {
        _tag: 'Exit',
        exit: { _tag: 'Success', value: {} },
        requestId: 'unknown',
      },
      pending,
      notifications,
      {
        toClient: message => {
          toClient.push(message);
        },
        toServer: noop,
      },
    );

    assert.strictEqual(toClient.length, 0);
  });

  it('routes ClientProtocolError to the client', () => {
    const pending = new Set<number | string>();
    const notifications = new Set<number | string>();
    const toClient: unknown[] = [];

    routeDecodedMessage(
      {
        _tag: 'ClientProtocolError',
        error: { _tag: 'RpcClientError', reason: { _tag: 'RpcClientDefect', cause: 'exit', message: 'gone' } },
      },
      pending,
      notifications,
      {
        toClient: message => {
          toClient.push(message);
        },
        toServer: noop,
      },
    );

    assert.strictEqual(toClient.length, 1);
  });
});
