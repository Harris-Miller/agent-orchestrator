import { assert, describe, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { makeHubObservabilityLive } from './observability.ts';
import type { HubBuildTarget } from './observability.ts';

interface FetchCall {
  readonly body: string;
  readonly url: string;
}

const ENDPOINT_ENV = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318' };

const exportedWith = (target: HubBuildTarget, env: Record<string, string> = ENDPOINT_ENV) =>
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
    const configLive = ConfigProvider.layer(ConfigProvider.fromUnknown(env));

    yield* Effect.logInfo('hello').pipe(
      Effect.provide(makeHubObservabilityLive(target).pipe(Layer.provide(fetchLive), Layer.provide(configLive))),
    );

    return calls;
  });

describe('makeHubObservabilityLive', () => {
  it.effect('dev exports OTLP to the configured endpoint as hoa-hub, tagged build_target=dev', () =>
    Effect.gen(function* () {
      const calls = yield* exportedWith('dev');
      assert.isAbove(calls.length, 0);
      assert.isTrue(calls.every(call => call.url.startsWith('http://127.0.0.1:4318/')));
      assert.isTrue(calls.some(call => call.body.includes('build_target') && call.body.includes('dev')));
      assert.isTrue(calls.some(call => call.body.includes('hoa-hub')));
    }),
  );

  it.effect('dev with no endpoint in the env falls back to the local LGTM stack', () =>
    Effect.gen(function* () {
      const calls = yield* exportedWith('dev', {});
      assert.isAbove(calls.length, 0);
      assert.isTrue(calls.every(call => call.url.startsWith('http://127.0.0.1:4318/')));
    }),
  );

  it.effect('dev honours an endpoint from the env over the fallback', () =>
    Effect.gen(function* () {
      const calls = yield* exportedWith('dev', { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9999' });
      assert.isAbove(calls.length, 0);
      assert.isTrue(calls.every(call => call.url.startsWith('http://127.0.0.1:9999/')));
    }),
  );

  it.effect('prod never exports (no endpoint fallback either)', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* exportedWith('prod', {}), []);
    }),
  );

  it.effect('prod never exports, even when the env sets an OTLP endpoint', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* exportedWith('prod'), []);
    }),
  );
});
