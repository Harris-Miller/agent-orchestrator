import { Context } from 'effect';

export interface OS {
  readonly cwd: () => string;
  /** Allowlisted / host process environment (Node: `process.env`; Tauri: core allowlist). */
  readonly env: () => Readonly<Record<string, string>>;
  readonly homedir: () => string;
  readonly platform: () => string;
}

export const OS = Context.Service<OS>('agent-github-watcher/OS');
