import { ConfigProvider, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Otlp, OtlpSerialization } from 'effect/unstable/observability';

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
 * OTLP export for traces, logs, and metrics when host env enables it
 * (`OTEL_EXPORTER_OTLP_ENDPOINT`, unless `OTEL_SDK_DISABLED` or exporters omit `otlp`).
 * Requires {@link ConfigProvider} (from {@link HostConfigProviderLive}).
 */
export const ObservabilityLive = Otlp.layerFromConfig({
  resource: { serviceName: 'agent-orchestrator-desktop' },
}).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(OtelExporterDefaultsLive),
);
