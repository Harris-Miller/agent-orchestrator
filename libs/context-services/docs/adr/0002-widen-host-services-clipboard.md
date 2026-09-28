# Widen Host services with Clipboard

Host services include Clipboard alongside BundledResource, ChildProcessSpawner, FileSystem, OS, and Path so shared React and Agent Harness code can copy/paste plain text without importing a host clipboard SDK. Surface is web Async Clipboard ∩ Tauri clipboard-manager only (`writeText` / `readText`); label, clear, image, and html stay out. Live Adapters stay in host packages (`@lib/context-services-tauri`, `@lib/context-services-vscode-webview`); only host apps compose those Live Layers into the Host runtime.
