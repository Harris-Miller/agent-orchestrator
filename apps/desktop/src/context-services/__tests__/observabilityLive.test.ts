import { assert, describe, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

import { ObservabilityLive } from '../ObservabilityLive.ts';

const recordedUrls: string[] = [];

const stubFetch: typeof globalThis.fetch = input => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  recordedUrls.push(url);
  return Promise.resolve(new Response(JSON.stringify({ partialSuccess: {} }), { status: 200 }));
};

const StubFetchLive = Layer.succeed(FetchHttpClient.Fetch, stubFetch);

const TestConfigLive = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
  }),
);

const TestObservabilityLive = ObservabilityLive.pipe(Layer.provide(StubFetchLive), Layer.provide(TestConfigLive));

describe('ObservabilityLive OTLP export', () => {
  it.effect('POSTs traces and logs to OTLP via Fetch', () =>
    Effect.gen(function* () {
      recordedUrls.length = 0;

      yield* Effect.gen(function* () {
        yield* Effect.logInfo('otlp stub export');
        yield* Effect.void.pipe(Effect.withSpan('otlp-stub-span'));
      }).pipe(Effect.provide(TestObservabilityLive), Effect.scoped);

      assert.isTrue(recordedUrls.some(url => url.includes('/v1/traces')));
      assert.isTrue(recordedUrls.some(url => url.includes('/v1/logs')));
    }),
  );
});
