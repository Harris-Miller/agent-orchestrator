# @lib/context-services-tauri

Tauri live layers for the `OS` service defined in [`@lib/context-services`](../context-services), plus Effect platform primitives (`Path`, `FileSystem`, `ChildProcessSpawner`, config provider) backed by Tauri plugins.

Used by [`@apps/desktop`](../../apps/desktop) to run the Agent Harness against the real host OS from inside a Tauri webview.

See [`GLOSSARY.md`](./GLOSSARY.md) for the domain glossary.

## Exports

- `BundledResourceLive` — packaged resource path resolution
- `ClipboardLive` — plain-text clipboard via `@tauri-apps/plugin-clipboard-manager`
- `FileDialogLive` — native open-file dialog via `@tauri-apps/plugin-dialog` (`pickFiles` only)
- `OSLive` — `OS` service backed by `@tauri-apps/plugin-os`
- `PathLive` / `makeWin32Path` — Effect `Path` platform service
- `FileSystemLive` — Effect `FileSystem` platform service backed by `@tauri-apps/plugin-fs`
- `ChildProcessSpawnerLive` — spawn subprocesses via `@tauri-apps/plugin-shell`
- `ConfigProviderLive` — Effect `ConfigProvider` sourced from the Tauri host
- `TauriServicesLive` — combined layer bundling the above
- `mapTauriPlatformToNode` — normalize Tauri's platform string to Node's convention

## Scripts

```sh
pnpm --filter=@lib/context-services-tauri test
pnpm --filter=@lib/context-services-tauri typecheck
```
