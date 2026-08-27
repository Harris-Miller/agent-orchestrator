import { Effect, Ref, Result, Schema } from 'effect';

import { writeMessage } from './io';
import { InitializeRequest, MessageRequest, UnknownRequest } from './protocol';

export const handleLine = Effect.fn('handleLine')(function* (line: string, initialized: Ref.Ref<boolean>) {
  const raw = Schema.decodeUnknownResult(Schema.fromJsonString(UnknownRequest))(line);

  // handle parse errors
  if (Result.isFailure(raw)) {
    const parseError = {
      code: -32700,
      data: {},
      jsonrpc: '2.0',
      message: 'Parse error',
    };
    yield* writeMessage(parseError);
    return;
  }

  const request = raw.success;

  if (Schema.is(InitializeRequest)(request)) {
    if (yield* Ref.get(initialized)) {
      const alreadyInitializedError = {
        code: -32600,
        data: {},
        jsonrpc: '2.0',
        message: 'Already initialized',
      };
      yield* writeMessage(alreadyInitializedError);
      return;
    }

    yield* Ref.set(initialized, true);
    const initializedResponse = {
      id: request.id,
      jsonrpc: '2.0',
      result: {},
    };
    yield* writeMessage(initializedResponse);
    return;
  }

  if (Schema.is(MessageRequest)(request)) {
    const echos = request.params?.echos ?? [];
    for (const echo of echos) {
      yield* writeMessage({
        jsonrpc: '2.0',
        method: 'echo',
        params: { text: echo },
      });
    }

    const response = {
      id: request.id,
      jsonrpc: '2.0',
      result: { ok: true },
    };
    yield* writeMessage(response);
    return;
  }

  yield* writeMessage({
    error: {
      code: -32601,

      data: {},
      message: 'Method not found',
    },
    id: request.id,
    jsonrpc: '2.0',
  });
});
