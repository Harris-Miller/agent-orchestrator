import { ConfigProvider, Layer, References } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Otlp, OtlpSerialization } from 'effect/observability';

/** Build target as the hub knows it: only an explicit `dev` is dev; anything else is prod (fail closed). */
export type HubBuildTarget = 'dev' | 'prod';

/**
 * The starting client's app version, from `--service-version`. It lands on every hub signal, so anything but a short
 * version-like string becomes `unknown` (root ADR 0002).
 */
export const hubServiceVersion = (value: string | undefined): string =>
  value !== undefined && /^[\w.+-]{1,64}$/.test(value) ? value : 'unknown';

/** The local LGTM stack (`compose.yml`) every dev `.env.development` points at. */
const DEV_OTLP_ENDPOINT = 'http://127.0.0.1:4318';

/**
 * Effect's `layerFromConfig` defaults `OTEL_*_EXPORTER` to `[]` (no export); the OTel spec defaults them to `otlp`.
 * Mirrors the Hosts' `ObservabilityLive` (the hub cannot import Host libs). Unlike the Hosts, the dev hub also falls
 * back to {@link DEV_OTLP_ENDPOINT}: it takes its environment from whichever client happened to start it, and that
 * client (e.g. an installed VS Code extension outside Development mode) may not have loaded `.env.development`.
 * Environment values still win over these defaults.
 */
const OtelDefaultsLive = ConfigProvider.layerAdd(
  ConfigProvider.fromUnknown({
    OTEL_EXPORTER_OTLP_ENDPOINT: DEV_OTLP_ENDPOINT,
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
  }),
);

/** Effect defaults the minimum log level to `Info`, which drops Debug/Trace before the OTLP logger sees them. */
const AllLogLevelsLive = Layer.succeed(References.MinimumLogLevel, 'All');

/**
 * OTLP export for the hub's traces, logs and metrics. Dev only: `OTEL_EXPORTER_OTLP_ENDPOINT` is never read in a prod
 * build, since that env var is a common convention a user's machine may already set. In dev, the endpoint defaults to
 * the local LGTM stack. Every signal carries `build_target`. Requires a ConfigProvider (the default reads
 * `process.env`, inherited from the starting client).
 */
export const makeHubObservabilityLive = (target: HubBuildTarget, serviceVersion = 'unknown') =>
  target === 'dev'
    ? Layer.merge(
        AllLogLevelsLive,
        Otlp.layerFromConfig({
          resource: {
            // A fresh id per hub process tells a restarted hub from its predecessor.
            attributes: { build_target: target, 'service.instance.id': crypto.randomUUID() },
            serviceName: 'hoa-hub',
            serviceVersion,
          },
        }).pipe(
          Layer.provide(OtlpSerialization.layerJson),
          Layer.provide(FetchHttpClient.layer),
          Layer.provide(OtelDefaultsLive),
        ),
      )
    : Layer.empty;
