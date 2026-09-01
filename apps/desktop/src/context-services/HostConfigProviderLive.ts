import { OS } from '@lib/context-services';
import { ConfigProvider, Effect } from 'effect';

/** Installs Effect ConfigProvider backed by {@link OS}.env from the Tauri host. */
export const HostConfigProviderLive = ConfigProvider.layer(
  Effect.gen(function* () {
    const os = yield* OS;
    return ConfigProvider.fromEnv({ env: os.env() });
  }),
);
