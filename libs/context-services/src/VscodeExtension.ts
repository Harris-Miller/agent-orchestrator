import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not inspect or install the VS Code extension. */
export class VscodeExtensionFailed extends Schema.TaggedError<VscodeExtensionFailed>()('VscodeExtensionFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** What the Host found of VS Code: a working CLI, the app without one, or nothing. */
export type VscodeDetection =
  | { readonly _tag: 'AppOnly' }
  | { readonly _tag: 'Cli'; readonly path: string }
  | { readonly _tag: 'NotFound' };

/** The `.vsix` shipped with the Host and the Host version it was stamped with. */
export interface BundledVscodeExtension {
  readonly path: string;
  readonly version: string;
}

/**
 * Installs the HOA VS Code extension bundled with the Host into the user's VS Code. The Host owns the CLI lookup
 * and the `.vsix` path; callers pass neither.
 */
export interface VscodeExtension {
  /** False on Hosts that cannot install it (the VS Code webview); callers hide the feature. */
  readonly supported: boolean;
  /** `undefined` when this build did not bundle the `.vsix` (`tauri dev`). */
  readonly bundled: Effect.Effect<BundledVscodeExtension | undefined, VscodeExtensionFailed>;
  readonly detect: Effect.Effect<VscodeDetection, VscodeExtensionFailed>;
  /** Version VS Code reports installed, `undefined` when not installed. Needs a {@link VscodeDetection} `Cli`. */
  readonly installedVersion: Effect.Effect<string | undefined, VscodeExtensionFailed>;
  /** `--install-extension <bundled .vsix> --force`; fails with the CLI's stderr. */
  readonly installBundled: Effect.Effect<void, VscodeExtensionFailed>;
}

export const VscodeExtension = Context.Service<VscodeExtension>('VscodeExtension');
