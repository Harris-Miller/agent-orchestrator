declare const process: { readonly env: Record<string, string | undefined> };

/** Whether this bundle is a `dev` or `prod` build. */
export type BuildTarget = 'dev' | 'prod';

/**
 * Fixed at bundle time by the app's Vite `define` of `process.env.HOA_BUILD_TARGET` (static access, so it can be baked).
 * Fails closed: anything but an explicit `dev` (including unset, e.g. in unit tests) is `prod`, so the
 * Vite `define` must map only development mode to `dev`.
 */
export const buildTarget: BuildTarget = process.env.HOA_BUILD_TARGET === 'dev' ? 'dev' : 'prod';
