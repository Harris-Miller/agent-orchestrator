import { Analytics, AnalyticsNoopLive, appSessionId, appVersion, OS, posthogProjectToken } from '@lib/context-services';
import type { AnalyticsEvent, BuildTarget } from '@lib/context-services';
import { Config, DateTime, Effect, Layer } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';

/** Which Host the events come from. */
export type AnalyticsHost = 'desktop' | 'vscode';

/** One capture attempt is abandoned after this long: no retry. */
const ATTEMPT_TIMEOUT = '5 seconds';

/** Where the local PostHog (compose setup outside this repo, `docs/local-posthog.md`) listens. */
const DEFAULT_HOST = 'http://localhost:8000';

/**
 * Posts one event to PostHog's capture endpoint (`/i/v0/e/`, `{ api_key, batch }`). The app-session id is the
 * `distinct_id` (and `$session_id`) until #193 adds a persisted anonymous user id.
 */
const send = (
  client: HttpClient.HttpClient,
  endpoint: string,
  token: string,
  common: Readonly<Record<string, string>>,
  event: AnalyticsEvent,
) =>
  Effect.gen(function* () {
    const timestamp = DateTime.formatIso(yield* DateTime.now);
    const request = yield* HttpClientRequest.post(endpoint).pipe(
      HttpClientRequest.bodyJson({
        api_key: token,
        batch: [
          {
            event: event.name,
            properties: { ...event.properties, ...common, $session_id: appSessionId, distinct_id: appSessionId },
            timestamp,
          },
        ],
      }),
    );
    yield* client.execute(request);
  }).pipe(
    Effect.timeout(ATTEMPT_TIMEOUT),
    // Analytics never fails the app: a failed attempt is only a fixed debug log (the cause can carry the request body, incl. `api_key`).
    Effect.catchCause(() => Effect.logDebug('Analytics capture failed')),
  );

/**
 * PostHog Live for {@link Analytics}: the only code that knows PostHog's wire format. Dev builds only; a prod build
 * returns the no-op without reading any config. The token is fixed at bundle time ({@link posthogProjectToken}, from
 * the app's `.env`); an empty token is the no-op, silently. In dev, also reads `POSTHOG_HOST` at runtime (default
 * {@link DEFAULT_HOST}). Requires {@link HttpClient}, {@link OS}, and a ConfigProvider (from the Host's `ConfigProviderLive`).
 */
export const makeAnalyticsLive = (
  target: BuildTarget,
  host: AnalyticsHost,
  projectToken: string = posthogProjectToken,
): Layer.Layer<Analytics, never, HttpClient.HttpClient | OS> =>
  target === 'dev'
    ? Layer.unwrap(
        Effect.gen(function* () {
          const token = projectToken.trim();
          if (token === '') {
            return AnalyticsNoopLive;
          }
          const posthogHost = (yield* Config.String('POSTHOG_HOST').pipe(Config.withDefault(DEFAULT_HOST))).trim();
          const client = yield* HttpClient.HttpClient;
          const os = yield* OS;
          const endpoint = `${posthogHost.replace(/\/+$/, '')}/i/v0/e/`;
          const common = {
            app_version: appVersion,
            build_target: target,
            os: os.platform(),
            host,
          };
          return Layer.succeed(Analytics, {
            // Forked and detached so a slow or down PostHog can never block or fail the user action.
            capture: event => Effect.forkDetach(send(client, endpoint, token, common, event)).pipe(Effect.asVoid),
          });
        }).pipe(
          // A malformed config value must not break the app either: fall back to the no-op.
          Effect.catchCause(() => Effect.succeed(AnalyticsNoopLive)),
        ),
      )
    : AnalyticsNoopLive;
