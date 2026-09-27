# Widen Host services with BundledResource

Host services include `BundledResource` alongside ChildProcessSpawner, FileSystem, OS, and Path so shared harness code can resolve packaged ACP adapter entries without importing Tauri or VS Code APIs. Live Adapters stay in host packages (`@lib/context-services-tauri`, future VS Code Live); only `apps/*` compose those Live Layers into `createHostRuntime`.
