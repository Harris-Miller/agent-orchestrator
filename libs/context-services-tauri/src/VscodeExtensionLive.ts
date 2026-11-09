import { VscodeExtension, VscodeExtensionFailed } from '@lib/context-services';
import type { BundledVscodeExtension, VscodeDetection } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { Effect, Layer } from 'effect';

const call = <A>(command: string): Effect.Effect<A, VscodeExtensionFailed> =>
  Effect.tryPromise({
    catch: cause =>
      new VscodeExtensionFailed({ cause, message: cause instanceof Error ? cause.message : String(cause) }),
    try: () => invoke<A>(command),
  });

/** Tauri Live for {@link VscodeExtension}: constrained `vscode_extension` commands in `src-tauri`. */
export const VscodeExtensionLive = Layer.succeed(VscodeExtension, {
  bundled: call<BundledVscodeExtension | null>('bundled_vscode_extension').pipe(
    Effect.map(bundled => bundled ?? undefined),
  ),
  detect: call<VscodeDetection>('detect_vscode'),
  installBundled: call<null>('install_bundled_vscode_extension').pipe(Effect.asVoid),
  installedVersion: call<string | null>('vscode_installed_extension_version').pipe(
    Effect.map(version => version ?? undefined),
  ),
  supported: true,
});
