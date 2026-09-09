import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Otlp, OtlpSerialization } from 'effect/unstable/observability';

/**
 * OTLP export for traces, logs, and metrics when host env enables it
 * (`OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_*_EXPORTER=otlp`).
 * Requires {@link ConfigProvider} (from {@link HostConfigProviderLive}).
 */
export const ObservabilityLive = Otlp.layerFromConfig({
  resource: { serviceName: 'agent-orchestrator-desktop' },
}).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));
