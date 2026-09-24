# Host services in the ACP Atom runtime

The ACP Atom runtime is parameterized with a portable **Host services** Layer (`ChildProcessSpawner | FileSystem | OS | Path`). Desktop composes `TauriServicesLive` once at the runtime factory (`createAcpRuntime`) and exports that same Layer as `hostServicesLayer` for fire-and-forget forks. We rejected injecting the Layer at the React app root (no behavior win) and rejected widening Host services to include ConfigProvider / Observability (those stay desktop-only composition extras outside the portable Seam).
