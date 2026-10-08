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

  it('tracks id-less agent notifications with unique ids so RpcServer can overlap them', () => {
    const pending = new Set<number | string>();
    const notifications = new Set<number | string>();
    const toServer: { id: number | string }[] = [];

    const notify = (): void => {
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
            toServer.push(message as { id: number | string });
          },
        },
      );
    };

    notify();
    notify();

    assert.strictEqual(toServer.length, 2);
    assert.strictEqual(notifications.size, 2);
    assert.notStrictEqual(toServer[0]?.id, '');
    assert.notStrictEqual(toServer[1]?.id, '');
    assert.notStrictEqual(toServer[0]?.id, toServer[1]?.id);
    assert.deepStrictEqual([...notifications], [toServer[0]?.id, toServer[1]?.id]);
  });

  it('keeps explicit notification ids unchanged', () => {
    const pending = new Set<number | string>();
    const notifications = new Set<number | string>();
    const toServer: { id: number | string }[] = [];

    routeDecodedMessage(
      {
        _tag: 'Request',
        headers: [],
        id: 'explicit-notif',
        isNotification: true,
        payload: { sessionId: 's1' },
        tag: 'session/update',
      },
      pending,
      notifications,
      {
        toClient: noop,
        toServer: message => {
          toServer.push(message as { id: number | string });
        },
      },
    );

    assert.strictEqual(toServer[0]?.id, 'explicit-notif');
    assert.deepStrictEqual([...notifications], ['explicit-notif']);
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

  it('routes connection-level Defect (no requestId) to the client', () => {
    const pending = new Set<number | string>([31]);
    const notifications = new Set<number | string>();
    const toClient: unknown[] = [];

    routeDecodedMessage(
      {
        _tag: 'Defect',
        defect: { message: 'Child process exited with code 1' },
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

  it('remaps AcpError-shaped Exit Die to Fail before forwarding', () => {
    const pending = new Set<number | string>(['req-1']);
    const notifications = new Set<number | string>();
    const toClient: unknown[] = [];

    routeDecodedMessage(
      {
        _tag: 'Exit',
        exit: {
          _tag: 'Failure',
          cause: [
            {
              _tag: 'Die',
              defect: {
                _tag: 'stray',
                code: -32000,
                data: { details: 'rate limited' },
                message: 'Rate limit exceeded',
              },
            },
          ],
        },
        requestId: 'req-1',
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

    assert.deepStrictEqual(toClient[0], {
      _tag: 'Exit',
      exit: {
        _tag: 'Failure',
        cause: [
          {
            _tag: 'Fail',
            error: {
              code: -32000,
              data: { details: 'rate limited' },
              message: 'Rate limit exceeded',
            },
          },
        ],
      },
      requestId: 'req-1',
    });
  });

  it('leaves non-AcpError Exit Die unchanged', () => {
    const pending = new Set<number | string>(['req-1']);
    const notifications = new Set<number | string>();
    const toClient: unknown[] = [];
    const defect = { message: 'Child process exited with code 1' };

    routeDecodedMessage(
      {
        _tag: 'Exit',
        exit: {
          _tag: 'Failure',
          cause: [{ _tag: 'Die', defect }],
        },
        requestId: 'req-1',
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

    assert.deepStrictEqual(toClient[0], {
      _tag: 'Exit',
      exit: {
        _tag: 'Failure',
        cause: [{ _tag: 'Die', defect }],
      },
      requestId: 'req-1',
    });
  });
});
