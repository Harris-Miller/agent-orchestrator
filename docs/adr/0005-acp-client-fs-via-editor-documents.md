# ACP Client filesystem goes through VS Code documents, advertised on VS Code only

The Agent's `fs/read_text_file` and `fs/write_text_file` are answered by the extension host through VS Code documents (a dedicated `EditorFiles` Host service and its own Host IPC requests), not through the disk-only `FsReadFileString` / `FsWriteFileString`. Reading from disk would hide the unsaved editor content that is the reason to offer Client filesystem methods at all. A write replaces the whole content of an open document and saves it, so the editor and disk agree afterwards; closed files are written to disk, creating parent directories.

`clientCapabilities.fs` is advertised only when the Host's `EditorFiles` is supported, which is the VS Code webview alone. Desktop keeps not advertising it: it has no editor documents, and advertising a disk-only path there would change Agent behavior for no gain. The shared Client handlers fail with an ACP error where `EditorFiles` is unsupported instead of returning empty success.

Whether any adapter calls these methods is outside this decision (the Claude and Codex adapters inspected for #119 use their own file tools), so the capability costs nothing until one does.
