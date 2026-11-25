import { assert, describe, it } from '@effect/vitest';
import { EditorFilesFailed } from '@lib/context-services';
import type { EditorFiles, EditorFilesReadWindow } from '@lib/context-services';
import { ClientRpcs } from '@lib/effect-acp';
import { Effect } from 'effect';
import { RpcTest } from 'effect/rpc';

import { isAbsolute, join, resolve } from 'node:path';

import { makeClientHandlers } from './clientHandlers.ts';

const abs = resolve(join('workspace', 'a.ts'));

type Calls = { reads: { path: string; window?: EditorFilesReadWindow }[]; writes: { content: string; path: string }[] };

const makeClient = (options: { supported?: boolean; fail?: boolean } = {}) =>
  Effect.gen(function* () {
    const calls: Calls = { reads: [], writes: [] };
    const fake: EditorFiles = {
      readText: (path, window) => {
        calls.reads.push(window === undefined ? { path } : { path, window });
        return options.fail === true
          ? Effect.fail(new EditorFilesFailed({ message: `secret ${path}` }))
          : Effect.succeed('line2\n');
      },
      supported: options.supported ?? true,
      writeText: (path, content) => {
        calls.writes.push({ content, path });
        return options.fail === true ? Effect.fail(new EditorFilesFailed({ message: 'x' })) : Effect.void;
      },
    };
    const handlers = makeClientHandlers(
      'claude-agent-acp',
      fake,
      () => undefined,
      () => undefined,
      () => undefined,
    );
    const client = yield* RpcTest.makeClient(ClientRpcs).pipe(Effect.provide(handlers));
    return { calls, client };
  });

const errorCode = (error: unknown): number => (error as { code: number }).code;

describe('fs handlers over the Client RPC path', () => {
  it.effect('reads with a 1-based window', () =>
    Effect.gen(function* () {
      assert.isTrue(isAbsolute(abs));
      const { calls, client } = yield* makeClient();
      const result = yield* client['fs/read_text_file']({ limit: 1, line: 2, path: abs, sessionId: 's1' });
      assert.strictEqual(result.content, 'line2\n');
      assert.deepStrictEqual(calls.reads, [{ path: abs, window: { limit: 1, line: 2 } }]);
    }),
  );

  it.effect('writes and returns an empty result', () =>
    Effect.gen(function* () {
      const { calls, client } = yield* makeClient();
      const result = yield* client['fs/write_text_file']({ content: 'body', path: abs, sessionId: 's1' });
      assert.deepStrictEqual({ ...result }, {});
      assert.deepStrictEqual(calls.writes, [{ content: 'body', path: abs }]);
    }),
  );

  it.effect('rejects a relative path and bad windows with -32602 without calling the Host', () =>
    Effect.gen(function* () {
      const { calls, client } = yield* makeClient();
      const relative = yield* client['fs/read_text_file']({ path: 'rel.ts', sessionId: 's1' }).pipe(Effect.flip);
      assert.strictEqual(errorCode(relative), -32602);
      const badLine = yield* client['fs/read_text_file']({ line: 0, path: abs, sessionId: 's1' }).pipe(Effect.flip);
      assert.strictEqual(errorCode(badLine), -32602);
      const badLimit = yield* client['fs/read_text_file']({ limit: -1, path: abs, sessionId: 's1' }).pipe(Effect.flip);
      assert.strictEqual(errorCode(badLimit), -32602);
      const badWrite = yield* client['fs/write_text_file']({ content: 'x', path: 'rel.ts', sessionId: 's1' }).pipe(
        Effect.flip,
      );
      assert.strictEqual(errorCode(badWrite), -32602);
      assert.deepStrictEqual(calls, { reads: [], writes: [] });
    }),
  );

  it.effect('answers -32601 when EditorFiles is unsupported', () =>
    Effect.gen(function* () {
      const { calls, client } = yield* makeClient({ supported: false });
      const read = yield* client['fs/read_text_file']({ path: abs, sessionId: 's1' }).pipe(Effect.flip);
      const write = yield* client['fs/write_text_file']({ content: 'x', path: abs, sessionId: 's1' }).pipe(Effect.flip);
      assert.strictEqual(errorCode(read), -32601);
      assert.strictEqual(errorCode(write), -32601);
      assert.deepStrictEqual(calls, { reads: [], writes: [] });
    }),
  );

  it.effect('maps EditorFilesFailed to a generic -32603', () =>
    Effect.gen(function* () {
      const { client } = yield* makeClient({ fail: true });
      const read = yield* client['fs/read_text_file']({ path: abs, sessionId: 's1' }).pipe(Effect.flip);
      const write = yield* client['fs/write_text_file']({ content: 'x', path: abs, sessionId: 's1' }).pipe(Effect.flip);
      assert.strictEqual(errorCode(read), -32603);
      assert.strictEqual(errorCode(write), -32603);
      assert.notInclude(JSON.stringify(read), 'secret');
    }),
  );
});
