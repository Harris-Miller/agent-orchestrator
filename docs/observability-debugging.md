# Debugging missing or odd telemetry

Recipe for dev OTLP logs/traces that stop arriving (or look wrong) in Loki / Tempo. Learned the hard way in #460 / #464, when `hoa-vscode` logs silently stopped for days.

## First move: date the break

Before forming any hypothesis, count lines per day for the old and new `service_name` values. The day the count drops to zero is the break; check what changed that day (rename, env, extension update, collector) before guessing at causes.

```logql
sum by (service_name) (count_over_time({service_name=~"hoa-.+"}[1d]))
```

Run it as a range query with a 1d step.

## Loki gotchas

- **Only `service_name` is a stream label.** Session ids and other attributes are _structured metadata_ with underscored keys (`app_session_id`, not `app_session.id`). Filter them after the selector with a label filter (`| app_session_id="…"`), never inside `{…}`.
- **Timestamps are nanoseconds** (API `start` / `end`, log entry timestamps). Seconds or milliseconds silently query 1970.
- **Range queries are capped at 30 days.** A longer window errors or truncates; split it.
- **Day-bucket `count_over_time` results are labelled with the window end, in UTC.** A bucket stamped Nov 12 covers the 24h _before_ that instant, so a local-time "nothing since the 12th" reads one bucket off.

## Dev export is env-driven

Dev builds export only when `OTEL_EXPORTER_OTLP_ENDPOINT` reaches the webview's environment. In the VS Code extension that env comes from the extension host's `process.env`, which other extensions share and mutate (a bundled Copilot extension deleted the var in #460). In Extension Development (F5), the extension host warns when the webview env lacks the endpoint. Look for `OTEL_EXPORTER_OTLP_ENDPOINT is missing` in the Debug Console of the window that launched the dev host, or in Output › Log (Extension Host) of the dev host itself.
