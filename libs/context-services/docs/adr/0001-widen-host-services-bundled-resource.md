# Widen Host services with BundledResource

Host services include BundledResource alongside ChildProcessSpawner, FileSystem, OS, and Path so Backend Harness code can resolve packaged ACP adapter entries without importing a host SDK. Live Adapters stay in host packages; only host apps compose those Live Layers into the Host runtime.
