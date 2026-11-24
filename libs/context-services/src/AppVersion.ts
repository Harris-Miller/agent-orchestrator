declare const process: { readonly env: Record<string, string | undefined> };

/**
 * The app version, fixed at bundle time by the app's Vite `define` of `process.env.HOA_APP_VERSION` (read from the
 * app's own `package.json`, which release CI stamps with the computed version; static access, so it can be baked). Fails closed to `unknown` (e.g. in unit tests).
 */
export const appVersion: string = process.env.HOA_APP_VERSION ?? 'unknown';
