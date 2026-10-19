import { ConfigProvider, Layer, References } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Otlp, OtlpSerialization } from 'effect/observability';

/**
 * Effect's `layerFromConfig` defaults `OTEL_*_EXPORTER` to `[]` (no export).
 * OTel env-var spec defaults them to `otlp`. Supply that fallback so release
 * only needs an endpoint; exporters stay optionally overridable / disableable.
 */
const OtelExporterDefaultsLive = ConfigProvider.layerAdd(
  ConfigProvider.fromUnknown({
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
  }),
);

/**
 * Effect defaults {@link References.MinimumLogLevel} to `Info`, which drops
 * Debug/Trace before any logger (including OTLP) sees them.
 */
const AllLogLevelsLive = Layer.succeed(References.MinimumLogLevel, 'All');

/**
 * OTLP export for traces, logs, and metrics when host env enables it
 * (`OTEL_EXPORTER_OTLP_ENDPOINT`, unless `OTEL_SDK_DISABLED` or exporters omit `otlp`).
 * Requires {@link ConfigProvider} (from {@link ConfigProviderLive}).
 */
export const ObservabilityLive = Layer.merge(
  AllLogLevelsLive,
  Otlp.layerFromConfig({
    resource: { serviceName: 'agent-orchestrator-vscode' },
  }).pipe(
    Layer.provide(OtlpSerialization.layerJson),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(OtelExporterDefaultsLive),
  ),
);
