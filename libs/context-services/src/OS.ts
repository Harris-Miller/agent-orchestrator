import { Context } from 'effect';

export interface OS {
  /** Node-compatible CPU arch (`x64`, `arm64`, …). */
  readonly arch: () => string;
  readonly cwd: () => string;
  /** Allowlisted / host process environment (Node: `process.env`; Tauri: core allowlist). */
  readonly env: () => Readonly<Record<string, string>>;
  readonly homedir: () => string;
  readonly platform: () => string;
}

export const OS = Context.Service<OS>('OS');
