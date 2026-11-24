import { appSessionId, appVersion, buildTarget } from '@lib/context-services';
import { APP_SESSION_ID, BUILD_TARGET } from '@lib/hub/telemetryKeys';
import type { BuildTarget } from '@lib/context-services';
import { ConfigProvider, Layer, References } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Otlp, OtlpSerialization } from 'effect/observability';

/**
 * Effect's `layerFromConfig` defaults `OTEL_*_EXPORTER` to `[]` (no export).
 * OTel env-var spec defaults them to `otlp`. Supply that fallback so dev
 * only needs an endpoint; exporters stay optionally overridable / disableable.
 */
const OtelExporterDefaultsLive = ConfigProvider.layerAdd(
  ConfigProvider.fromUnknown({
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
  }),
);

/**
 * Effect defaults {@link References.MinimumLogLevel} to `Info`, which drops
 * Debug/Trace before any logger (including OTLP) sees them.
 */
const AllLogLevelsLive = Layer.succeed(References.MinimumLogLevel, 'All');

/**
 * OTLP export for traces and logs. Dev builds only: the host-env OTLP config
 * (`OTEL_EXPORTER_OTLP_ENDPOINT`, unless `OTEL_SDK_DISABLED` or exporters omit `otlp`) is never read
 * in a prod build, because that env var is a common convention a user's machine may already set.
 * Every signal carries a `build.target` resource attribute.
 * Requires {@link ConfigProvider} (from {@link ConfigProviderLive}).
 */
export const makeObservabilityLive = (target: BuildTarget) =>
  target === 'dev'
    ? Layer.merge(
        AllLogLevelsLive,
        Otlp.layerFromConfig({
          resource: {
            attributes: { [APP_SESSION_ID]: appSessionId, [BUILD_TARGET]: target },
            serviceName: 'hoa-desktop',
            serviceVersion: appVersion,
          },
        }).pipe(
          Layer.provide(OtlpSerialization.layerJson),
          Layer.provide(FetchHttpClient.layer),
          Layer.provide(OtelExporterDefaultsLive),
        ),
      )
    : Layer.empty;

export const ObservabilityLive = makeObservabilityLive(buildTarget);
