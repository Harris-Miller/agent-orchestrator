# Host runtime bind slot for shared Harness application state

Shared Backend Harness and Harness application state live in the ui context so desktop and the VS Code webview can import the same Atoms. We bind each host’s Live Host services into a module slot (`bindHostRuntime`) before those Atoms load, rather than constructing Atoms in the host and re-exporting them. That keeps Atom exports inside ui so React can move here later without a host↔ui cycle; the cost is an explicit app boot-order contract (bind before importing Atoms).
