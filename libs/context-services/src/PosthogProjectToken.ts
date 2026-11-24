declare const process: { readonly env: Record<string, string | undefined> };

/**
 * The PostHog project token, fixed at bundle time by the app's Vite `define` of `process.env.POSTHOG_PROJECT_TOKEN`
 * (read from the app's gitignored `.env`, or the shell; static access, so it can be baked). Empty when unset or in a non-dev build (e.g. in
 * unit tests), which keeps analytics a no-op. Only a dev build ever uses it (root ADR 0004).
 */
export const posthogProjectToken: string = (process.env.POSTHOG_PROJECT_TOKEN ?? '').trim();
