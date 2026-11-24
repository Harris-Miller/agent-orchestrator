import { assert, describe, it } from '@effect/vitest';
import { appSessionId, appVersion } from '@lib/context-services';
import type { BuildTarget } from '@lib/context-services';
import { ConfigProvider, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { makeObservabilityLive } from '../ObservabilityLive.ts';

interface FetchCall {
  readonly body: string;
  readonly url: string;
}

const exportedWith = (target: BuildTarget) =>
  Effect.gen(function* () {
    const calls: FetchCall[] = [];
    const fetchLive = Layer.succeed(FetchHttpClient.Fetch, (input, init) => {
      const body = init?.body;
      calls.push({
        body: typeof body === 'string' ? body : new TextDecoder().decode(body as Uint8Array),
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      });
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const configLive = ConfigProvider.layer(
      ConfigProvider.fromUnknown({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318' }),
    );

    yield* Effect.logInfo('hello').pipe(
      Effect.provide(makeObservabilityLive(target).pipe(Layer.provide(fetchLive), Layer.provide(configLive))),
    );

    return calls;
  });

describe('makeObservabilityLive', () => {
  it.effect('dev exports OTLP to the host-configured endpoint, tagged build_target=dev', () =>
    Effect.gen(function* () {
      const calls = yield* exportedWith('dev');
      assert.isAbove(calls.length, 0);
      assert.isTrue(calls.every(call => call.url.startsWith('http://127.0.0.1:4318/')));
      assert.isTrue(calls.some(call => call.body.includes('build_target') && call.body.includes('dev')));
      assert.isTrue(calls.some(call => call.body.includes('app_session.id') && call.body.includes(appSessionId)));
      assert.isTrue(calls.some(call => call.body.includes('service.version') && call.body.includes(appVersion)));
    }),
  );

  it.effect('prod never exports, even when the host env sets an OTLP endpoint', () =>
    Effect.gen(function* () {
      const calls = yield* exportedWith('prod');
      assert.deepStrictEqual(calls, []);
    }),
  );
});
