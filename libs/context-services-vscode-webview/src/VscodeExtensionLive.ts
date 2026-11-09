import { VscodeExtension, VscodeExtensionFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

const unsupported = Effect.fail(new VscodeExtensionFailed({ message: 'VscodeExtension unsupported in VS Code' }));

/** VS Code webview Live for {@link VscodeExtension}: not supported, the extension is already running in VS Code. */
export const VscodeExtensionLive = Layer.succeed(VscodeExtension, {
  bundled: Effect.succeed(undefined),
  detect: unsupported,
  installBundled: unsupported,
  installedVersion: unsupported,
  supported: false,
});
