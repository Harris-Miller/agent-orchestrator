import { assert, describe, it } from '@effect/vitest';
import { Analytics, appSessionId, makeAnalyticsEvent, OS } from '@lib/context-services';
import type { BuildTarget } from '@lib/context-services';
import { ConfigProvider, Deferred, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { makeAnalyticsLive } from '../PosthogAnalyticsLive.ts';

interface FetchCall {
  readonly body: unknown;
  readonly url: string;
}

const osLive = Layer.succeed(OS, {
  arch: () => 'arm64',
  cwd: () => '/work',
  env: () => ({}),
  homedir: () => '/home',
  platform: () => 'darwin',
});

const event = makeAnalyticsEvent('session_archived', { launch_target: 'codex-acp' });

/** Captures one event through a Live over a fake fetch; `respond` shapes the fake PostHog. */
const capture = (
  target: BuildTarget,
  config: Record<string, string>,
  respond: () => Promise<Response> = () => Promise.resolve(new Response(null, { status: 200 })),
) =>
  Effect.gen(function* () {
    const calls: FetchCall[] = [];
    const sent = yield* Deferred.make<undefined>();
    const fetchLive = Layer.succeed(FetchHttpClient.Fetch, (input, init) => {
      const body = init?.body;
      calls.push({
        body: JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body as Uint8Array)),
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      });
      Deferred.doneUnsafe(sent, Effect.succeed(undefined));
      return respond();
    });
    const live = makeAnalyticsLive(target, 'desktop').pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(fetchLive),
      Layer.provide(osLive),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config))),
    );
    yield* Effect.gen(function* () {
      const analytics = yield* Analytics;
      yield* analytics.capture(event);
    }).pipe(Effect.provide(live));
    return { calls, sent };
  });

describe('makeAnalyticsLive', () => {
  it.effect('dev with a token posts the PostHog capture body with the common properties', () =>
    Effect.gen(function* () {
      const { calls, sent } = yield* capture('dev', {
        POSTHOG_HOST: 'http://localhost:9999/',
        POSTHOG_PROJECT_TOKEN: 'phc_test',
      });
      yield* Deferred.await(sent);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'http://localhost:9999/i/v0/e/');
      const body = calls[0].body as {
        api_key: string;
        batch: { event: string; properties: Record<string, unknown>; timestamp: string }[];
      };
      assert.strictEqual(body.api_key, 'phc_test');
      assert.strictEqual(body.batch.length, 1);
      const [item] = body.batch;
      assert.strictEqual(item.event, 'session_archived');
      assert.isFalse(Number.isNaN(Date.parse(item.timestamp)));
      assert.deepStrictEqual(item.properties, {
        $session_id: appSessionId,
        app_version: 'unknown',
        build_target: 'dev',
        distinct_id: appSessionId,
        launch_target: 'codex-acp',
        os: 'darwin',
        runtime: 'desktop',
      });
    }),
  );

  it.effect('defaults the host to the local PostHog', () =>
    Effect.gen(function* () {
      const { calls, sent } = yield* capture('dev', { POSTHOG_PROJECT_TOKEN: 'phc_test' });
      yield* Deferred.await(sent);
      assert.strictEqual(calls[0].url, 'http://localhost:8000/i/v0/e/');
    }),
  );

  it.effect('an empty or unset token sends nothing', () =>
    Effect.gen(function* () {
      const empty = yield* capture('dev', { POSTHOG_PROJECT_TOKEN: '' });
      const unset = yield* capture('dev', {});
      yield* Effect.yieldNow;
      assert.deepStrictEqual(empty.calls, []);
      assert.deepStrictEqual(unset.calls, []);
    }),
  );

  it.effect('prod sends nothing, even with the env set', () =>
    Effect.gen(function* () {
      const { calls } = yield* capture('prod', { POSTHOG_PROJECT_TOKEN: 'phc_test' });
      yield* Effect.yieldNow;
      assert.deepStrictEqual(calls, []);
    }),
  );

  it.effect('a failing send does not fail the caller', () =>
    Effect.gen(function* () {
      const { calls, sent } = yield* capture('dev', { POSTHOG_PROJECT_TOKEN: 'phc_test' }, () =>
        Promise.reject(new Error('connection refused')),
      );
      yield* Deferred.await(sent);
      assert.strictEqual(calls.length, 1);
    }),
  );
});
