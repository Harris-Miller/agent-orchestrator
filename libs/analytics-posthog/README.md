# @lib/analytics-posthog

PostHog Live for the portable `Analytics` Host service from [`@lib/context-services`](../context-services). The only code that knows PostHog's wire format (`POST {host}/i/v0/e/`); swapping vendors means replacing this package.

`makeAnalyticsLive(buildTarget, host)` returns a no-op in prod builds, and in dev builds when the build-time `POSTHOG_PROJECT_TOKEN` (the app's gitignored `.env`) is empty or unset. See root ADR [`0004`](../../docs/adr/0004-analytics-events-separate-from-otlp.md) and [`docs/local-posthog.md`](../../docs/local-posthog.md).

```sh
pnpm --filter=@lib/analytics-posthog test
pnpm --filter=@lib/analytics-posthog typecheck
```
