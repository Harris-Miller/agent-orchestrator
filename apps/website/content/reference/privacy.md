# Privacy & telemetry

## Release builds send nothing

Release builds of HOA export no telemetry. OpenTelemetry (OTLP) export of traces, logs and metrics exists only in **development** builds, where it is sent to the endpoint in `OTEL_EXPORTER_OTLP_ENDPOINT` — that variable is never read by a release build, because your machine may already set it for something else.

## Private data is redacted at the source

Even in development builds, **private data** never reaches telemetry as plain text. Private data is:

- prompt and agent response text,
- file contents, file paths and `file://` URIs (the session cwd included),
- URLs, command lines, and environment values.

Each log line that would carry private data wraps it so it prints as `<redacted>` everywhere — the dev console included. Identifiers (session id, launch target, process id), counts and exit codes are not private data and stay readable so bug reports are useful.

## What leaves your machine

HOA itself talks to:

- **npm**, when you download a provider runtime,
- the **Antigravity** download and Google sign-in, if you use Antigravity.

Your agents talk to their own vendors under their own terms — HOA spawns them, but does not proxy or inspect their network traffic.
