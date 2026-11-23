import { ConfigProvider, Layer, References } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Otlp, OtlpSerialization } from 'effect/observability';

/** Build target as the hub knows it: only an explicit `dev` is dev; anything else is prod (fail closed). */
export type HubBuildTarget = 'dev' | 'prod';

/**
 * Effect's `layerFromConfig` defaults `OTEL_*_EXPORTER` to `[]` (no export); the OTel spec defaults them to `otlp`.
 * Mirrors the Hosts' `ObservabilityLive` (the hub cannot import Host libs), so dev only needs an endpoint.
 */
const OtelExporterDefaultsLive = ConfigProvider.layerAdd(
  ConfigProvider.fromUnknown({
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
  }),
);

/** Effect defaults the minimum log level to `Info`, which drops Debug/Trace before the OTLP logger sees them. */
const AllLogLevelsLive = Layer.succeed(References.MinimumLogLevel, 'All');

/**
 * OTLP export for the hub's traces, logs and metrics. Dev only: `OTEL_EXPORTER_OTLP_ENDPOINT` is never read in a prod
 * build, since that env var is a common convention a user's machine may already set. Every signal carries
 * `build_target`. Requires a ConfigProvider (the default reads `process.env`, inherited from the starting client).
 */
export const makeHubObservabilityLive = (target: HubBuildTarget) =>
  target === 'dev'
    ? Layer.merge(
        AllLogLevelsLive,
        Otlp.layerFromConfig({
          resource: { attributes: { build_target: target }, serviceName: 'hoa-hub' },
        }).pipe(
          Layer.provide(OtlpSerialization.layerJson),
          Layer.provide(FetchHttpClient.layer),
          Layer.provide(OtelExporterDefaultsLive),
        ),
      )
    : Layer.empty;
